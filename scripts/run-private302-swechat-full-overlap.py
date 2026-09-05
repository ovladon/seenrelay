#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import pathlib
import subprocess
import tempfile
from typing import Any

import pyarrow.dataset as ds
from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import GatedRepoError

REPO = "SALT-NLP/SWE-chat"
REVISION = "f66cca95b14caaa4177f7ed5eaa424608dadcffa"
FILENAME = "conversations.parquet"
EXPECTED_SIZE = 1_311_422_253
EXPECTED_BLOB_ID = "e8c76683b25698fc4312baf45fa6cb2297773946"
SCHEMA = "seenrelay-private302-swechat-full-browser-overlap-v1"
CORE_PATH = pathlib.Path(__file__).resolve().parent / "private302-swechat-overlap-core.mjs"
REQUIRED_COLUMNS = (
    "turn_id",
    "session_id",
    "turn_number",
    "turn_type",
    "tool_name",
    "tool_call_id",
    "tool_input_json",
    "timestamp",
)


def nonempty_string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None


def deterministic_input_bytes(value: Any) -> bytes:
    if not isinstance(value, dict):
        raise RuntimeError("tool_input_json must parse as a JSON object")
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def normalize_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.isoformat()
    if isinstance(value, str):
        return value
    raise RuntimeError("unexpected timestamp type in conversations.parquet")


def timestamp_order(value: str | None) -> tuple[int, float]:
    if not value:
        return (1, 0.0)
    raw = value.strip()
    if not raw:
        return (1, 0.0)
    try:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return (0, parsed.timestamp())
    except ValueError:
        return (1, 0.0)


def representative_key(call: dict[str, Any]) -> tuple[Any, ...]:
    return (
        *timestamp_order(call.get("timestamp")),
        call["session"],
        call["turn_number"],
        call["turn_id"],
    )


def parse_tool_input(raw: Any) -> tuple[dict[str, Any], bytes]:
    if not isinstance(raw, str):
        raise RuntimeError("WebFetch tool_input_json must be a JSON string")
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("WebFetch tool_input_json is invalid JSON") from exc
    return parsed, deterministic_input_bytes(parsed)


def scan_webfetch_calls(parquet_path: str) -> tuple[list[dict[str, Any]], dict[str, int]]:
    dataset = ds.dataset(parquet_path, format="parquet")
    missing = sorted(set(REQUIRED_COLUMNS) - set(dataset.schema.names))
    if missing:
        raise RuntimeError(f"pinned conversations schema missing required columns: {','.join(missing)}")

    scanner = dataset.scanner(
        columns=list(REQUIRED_COLUMNS),
        filter=(ds.field("turn_type") == "tool_use") & (ds.field("tool_name") == "WebFetch"),
        batch_size=65_536,
        use_threads=True,
    )

    seen_turn_ids: set[str] = set()
    physical: dict[tuple[str, str], tuple[bytes, dict[str, Any]]] = {}
    selected_rows = 0
    duplicate_physical_removed = 0

    for batch in scanner.to_batches():
        for row in batch.to_pylist():
            if row.get("turn_type") != "tool_use" or row.get("tool_name") != "WebFetch":
                raise RuntimeError("predicate pushdown returned a non-WebFetch row")
            selected_rows += 1

            turn_id = nonempty_string(row.get("turn_id"))
            session_id = nonempty_string(row.get("session_id"))
            tool_call_id = nonempty_string(row.get("tool_call_id"))
            if not turn_id:
                raise RuntimeError("selected WebFetch row missing turn_id")
            if not session_id:
                raise RuntimeError("selected WebFetch row missing native session_id")
            if not tool_call_id:
                raise RuntimeError("selected WebFetch row missing native tool_call_id")
            if turn_id in seen_turn_ids:
                raise RuntimeError("duplicate turn_id among selected WebFetch rows")
            seen_turn_ids.add(turn_id)

            turn_number = row.get("turn_number")
            if not isinstance(turn_number, int) or isinstance(turn_number, bool) or turn_number < 0:
                raise RuntimeError("selected WebFetch row has invalid turn_number")

            parsed_input, payload_bytes = parse_tool_input(row.get("tool_input_json"))
            call = {
                "session": session_id,
                "turn_number": turn_number,
                "turn_id": turn_id,
                "timestamp": normalize_timestamp(row.get("timestamp")),
                "raw_url": parsed_input.get("url"),
                "raw_prompt": parsed_input.get("prompt"),
            }
            physical_key = (session_id, tool_call_id)
            prior = physical.get(physical_key)
            if prior is None:
                physical[physical_key] = (payload_bytes, call)
                continue

            prior_payload, prior_call = prior
            if prior_payload != payload_bytes:
                raise RuntimeError("duplicate native physical WebFetch key has inconsistent parsed tool input")
            duplicate_physical_removed += 1
            if representative_key(call) < representative_key(prior_call):
                physical[physical_key] = (payload_bytes, call)

    calls = [entry[1] for entry in physical.values()]
    stats = {
        "selected_webfetch_rows_before_physical_dedup": selected_rows,
        "duplicate_physical_webfetch_records_removed": duplicate_physical_removed,
        "unique_physical_webfetch_calls": len(calls),
    }
    if selected_rows != len(calls) + duplicate_physical_removed:
        raise RuntimeError("physical dedup accounting mismatch")
    return calls, stats


def source_identity(api: HfApi) -> dict[str, Any]:
    info = api.dataset_info(REPO, revision=REVISION, files_metadata=True)
    if info.sha != REVISION:
        raise RuntimeError("resolved SWE-chat revision changed from PRIVATE301 lock")
    sibling = next((item for item in info.siblings if item.rfilename == FILENAME), None)
    if sibling is None:
        raise RuntimeError("locked conversations.parquet missing")
    blob_id = getattr(sibling, "blob_id", None)
    size = getattr(sibling, "size", None)
    if blob_id != EXPECTED_BLOB_ID or size != EXPECTED_SIZE:
        raise RuntimeError("conversations.parquet metadata identity differs from PRIVATE301 lock")
    return {
        "dataset": REPO,
        "resolved_revision": REVISION,
        "filename": FILENAME,
        "logical_size": EXPECTED_SIZE,
        "git_blob_id": EXPECTED_BLOB_ID,
    }


def privacy_block() -> dict[str, bool]:
    return {
        "raw_parquet_retained_in_artifact": False,
        "raw_urls_retained_in_artifact": False,
        "raw_prompts_retained_in_artifact": False,
        "session_ids_retained_in_artifact": False,
        "tool_call_ids_retained_in_artifact": False,
        "turn_ids_retained_in_artifact": False,
        "per_key_hashes_retained_in_artifact": False,
    }


def interpretation_block() -> dict[str, bool]:
    return {
        "observer_independence_proven": False,
        "private285_class_pass_authorized": False,
        "seenrelay_reuse_authorized": False,
        "production_change_authorized": False,
        "population_prevalence_claim_authorized": False,
        "commercial_claim_authorized": False,
    }


def blocked_report(status: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": status,
        "measurement_performed": False,
        "source": {
            "dataset": REPO,
            "resolved_revision": REVISION,
            "filename": FILENAME,
            "logical_size": EXPECTED_SIZE,
            "git_blob_id": EXPECTED_BLOB_ID,
        },
        "access": {
            "authorized_content_access_succeeded": False,
            "gate_bypass_attempted": False,
            "fallback_dataset_used": False,
        },
        "interpretation": interpretation_block(),
        "privacy": privacy_block(),
    }


def run_core(calls: list[dict[str, Any]]) -> dict[str, Any]:
    completed = subprocess.run(
        ["node", str(CORE_PATH)],
        input=json.dumps(calls, ensure_ascii=False, separators=(",", ":")),
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"PRIVATE302 Node overlap core failed: {completed.stderr.strip()}")
    try:
        result = json.loads(completed.stdout)
    except Exception as exc:
        raise RuntimeError("PRIVATE302 Node overlap core returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise RuntimeError("PRIVATE302 Node overlap core returned non-object")
    return result


def measured_report(source: dict[str, Any], extraction: dict[str, int], overlap: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": "MEASURED",
        "measurement_performed": True,
        "source": source,
        "access": {
            "authorized_content_access_succeeded": True,
            "gate_bypass_attempted": False,
            "fallback_dataset_used": False,
        },
        "extraction": extraction,
        "overlap": overlap,
        "interpretation": interpretation_block(),
        "privacy": privacy_block(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.output)

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_NO_AUTHORIZED_HF_TOKEN"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({"status": "ACCESS_BLOCKED_NO_AUTHORIZED_HF_TOKEN"}))
        return

    api = HfApi(token=token)
    source = source_identity(api)

    try:
        with tempfile.TemporaryDirectory(prefix="seenrelay-private302-") as temp_dir:
            parquet_path = hf_hub_download(
                repo_id=REPO,
                repo_type="dataset",
                filename=FILENAME,
                revision=REVISION,
                token=token,
                local_dir=temp_dir,
            )
            if os.path.getsize(parquet_path) != EXPECTED_SIZE:
                raise RuntimeError("downloaded conversations.parquet logical size mismatch")
            calls, extraction = scan_webfetch_calls(parquet_path)
            overlap = run_core(calls)
    except GatedRepoError:
        output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_GATED_DATASET_NOT_ACCEPTED"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({"status": "ACCESS_BLOCKED_GATED_DATASET_NOT_ACCEPTED"}))
        return

    report = measured_report(source, extraction, overlap)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "MEASURED",
        "classification": overlap.get("classification"),
        "eligible_http_webfetch_calls": overlap.get("eligible_http_webfetch_calls"),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
