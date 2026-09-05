#!/usr/bin/env python3
import argparse
from collections import Counter, defaultdict
import hashlib
import importlib.util
import json
import os
import pathlib
import tempfile
import urllib.error
from typing import Any

import pyarrow.dataset as ds
from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import GatedRepoError, HfHubHTTPError

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREP_PATH = ROOT / "scripts" / "prepare-private304-hf-oidc.py"
prep_spec = importlib.util.spec_from_file_location("private304_oidc", PREP_PATH)
prep = importlib.util.module_from_spec(prep_spec)
prep_spec.loader.exec_module(prep)

SCHEMA = "seenrelay-private309-swechat-turnid-integrity-v1"
REPO = "SALT-NLP/SWE-chat"
REVISION = "f66cca95b14caaa4177f7ed5eaa424608dadcffa"
FILENAME = "conversations.parquet"
EXPECTED_SIZE = 1311422253
EXPECTED_BLOB_ID = "e8c76683b25698fc4312baf45fa6cb2297773946"
COLUMNS = [
    "turn_type",
    "tool_name",
    "session_id",
    "turn_id",
    "turn_number",
    "tool_call_id",
    "timestamp",
    "tool_input_json",
]


def nonempty_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def opaque_input_digest(raw: Any) -> str:
    if not isinstance(raw, str):
        raise RuntimeError("selected WebFetch tool_input_json must be a JSON string")
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("selected WebFetch tool_input_json is invalid JSON") from exc
    canonical = json.dumps(parsed, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def timestamp_text(value: Any) -> str:
    if value is None:
        return ""
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


def blocked_report(status: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": status,
        "diagnostic_performed": False,
        "source": {
            "dataset": REPO,
            "resolved_revision": REVISION,
            "filename": FILENAME,
            "logical_size": EXPECTED_SIZE,
            "git_blob_id": EXPECTED_BLOB_ID,
        },
        "authentication": {
            "method": "HUGGING_FACE_USER_CICD_OIDC",
            "oidc_exchange_succeeded": False,
            "authorized_content_access_succeeded": False,
        },
        "privacy": privacy_block(),
        "interpretation": interpretation_block(),
    }


def privacy_block() -> dict[str, bool]:
    return {
        "hf_resource_retained": False,
        "github_oidc_token_retained": False,
        "hf_access_token_retained": False,
        "raw_parquet_retained_in_artifact": False,
        "raw_tool_input_retained_in_artifact": False,
        "url_or_prompt_value_retained": False,
        "session_ids_retained_in_artifact": False,
        "turn_ids_retained_in_artifact": False,
        "tool_call_ids_retained_in_artifact": False,
        "per_row_hashes_retained_in_artifact": False,
    }


def interpretation_block() -> dict[str, bool]:
    return {
        "overlap_computed": False,
        "reuse_opportunity_count_computed": False,
        "private285_pass_authorized": False,
        "observer_independence_proven": False,
        "production_change_authorized": False,
        "commercial_claim_authorized": False,
    }


def source_identity(api: HfApi) -> dict[str, Any]:
    info = api.dataset_info(REPO, revision=REVISION, files_metadata=True)
    if info.sha != REVISION:
        raise RuntimeError("resolved SWE-chat revision changed from PRIVATE301 lock")
    sibling = next((item for item in info.siblings if item.rfilename == FILENAME), None)
    if sibling is None:
        raise RuntimeError("locked conversations.parquet missing")
    if getattr(sibling, "blob_id", None) != EXPECTED_BLOB_ID or getattr(sibling, "size", None) != EXPECTED_SIZE:
        raise RuntimeError("conversations.parquet metadata identity differs from PRIVATE301 lock")
    return {
        "dataset": REPO,
        "resolved_revision": REVISION,
        "filename": FILENAME,
        "logical_size": EXPECTED_SIZE,
        "git_blob_id": EXPECTED_BLOB_ID,
    }


def aggregate_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    sessions: set[str] = set()
    turn_groups: dict[str, dict[str, Any]] = {}
    physical_groups: dict[tuple[str, str], dict[str, Any]] = {}
    structural_counts: Counter[tuple[Any, ...]] = Counter()
    turn_format_matches = 0
    turn_format_mismatches = 0

    for row in rows:
        if row.get("turn_type") != "tool_use" or row.get("tool_name") != "WebFetch":
            raise RuntimeError("diagnostic received non-WebFetch row")
        session_id = nonempty_string(row.get("session_id"))
        turn_id = nonempty_string(row.get("turn_id"))
        tool_call_id = nonempty_string(row.get("tool_call_id"))
        turn_number = row.get("turn_number")
        if not session_id or not turn_id or not tool_call_id:
            raise RuntimeError("selected WebFetch row missing native coordinate")
        if not isinstance(turn_number, int) or isinstance(turn_number, bool) or turn_number < 0:
            raise RuntimeError("selected WebFetch row has invalid turn_number")

        digest = opaque_input_digest(row.get("tool_input_json"))
        physical_key = (session_id, tool_call_id)
        sessions.add(session_id)
        expected_turn_id = f"{session_id}#{turn_number}"
        if turn_id == expected_turn_id:
            turn_format_matches += 1
        else:
            turn_format_mismatches += 1

        tg = turn_groups.setdefault(turn_id, {
            "count": 0,
            "sessions": set(),
            "turn_numbers": set(),
            "physical_keys": [],
        })
        tg["count"] += 1
        tg["sessions"].add(session_id)
        tg["turn_numbers"].add(turn_number)
        tg["physical_keys"].append(physical_key)

        pg = physical_groups.setdefault(physical_key, {
            "count": 0,
            "turn_ids": set(),
            "turn_numbers": set(),
            "digests": set(),
        })
        pg["count"] += 1
        pg["turn_ids"].add(turn_id)
        pg["turn_numbers"].add(turn_number)
        pg["digests"].add(digest)

        structural_counts[(turn_id, session_id, turn_number, tool_call_id, timestamp_text(row.get("timestamp")), digest)] += 1

    duplicate_turn_groups = [group for group in turn_groups.values() if group["count"] > 1]
    duplicate_physical_groups = [group for group in physical_groups.values() if group["count"] > 1]

    post_physical_turn_counts: Counter[str] = Counter()
    for turn_id, group in turn_groups.items():
        post_physical_turn_counts[turn_id] = len(set(group["physical_keys"]))

    metrics = {
        "selected_webfetch_rows": len(rows),
        "source_sessions_with_webfetch": len(sessions),
        "unique_turn_ids": len(turn_groups),
        "duplicate_turn_id_groups": len(duplicate_turn_groups),
        "duplicate_turn_id_excess_rows": sum(group["count"] - 1 for group in duplicate_turn_groups),
        "max_rows_per_turn_id": max((group["count"] for group in turn_groups.values()), default=0),
        "turn_id_matches_session_hash_turn_number_rows": turn_format_matches,
        "turn_id_format_mismatch_rows": turn_format_mismatches,
        "duplicate_turn_groups_spanning_multiple_sessions": sum(len(group["sessions"]) > 1 for group in duplicate_turn_groups),
        "duplicate_turn_groups_spanning_multiple_turn_numbers": sum(len(group["turn_numbers"]) > 1 for group in duplicate_turn_groups),
        "duplicate_turn_groups_with_multiple_physical_keys": sum(len(set(group["physical_keys"])) > 1 for group in duplicate_turn_groups),
        "duplicate_turn_groups_with_single_physical_key": sum(len(set(group["physical_keys"])) == 1 for group in duplicate_turn_groups),
        "duplicate_turn_groups_all_physical_keys_distinct": sum(len(set(group["physical_keys"])) == group["count"] for group in duplicate_turn_groups),
        "duplicate_turn_groups_with_repeated_physical_key": sum(len(set(group["physical_keys"])) < group["count"] for group in duplicate_turn_groups),
        "turn_id_duplicates_remaining_after_physical_dedup_groups": sum(count > 1 for count in post_physical_turn_counts.values()),
        "turn_id_duplicates_remaining_after_physical_dedup_excess_rows": sum(max(0, count - 1) for count in post_physical_turn_counts.values()),
        "unique_physical_keys": len(physical_groups),
        "duplicate_physical_key_groups": len(duplicate_physical_groups),
        "duplicate_physical_key_excess_rows": sum(group["count"] - 1 for group in duplicate_physical_groups),
        "duplicate_physical_key_groups_spanning_multiple_turn_ids": sum(len(group["turn_ids"]) > 1 for group in duplicate_physical_groups),
        "duplicate_physical_key_groups_spanning_multiple_turn_numbers": sum(len(group["turn_numbers"]) > 1 for group in duplicate_physical_groups),
        "duplicate_physical_key_groups_with_equal_canonical_input": sum(len(group["digests"]) == 1 for group in duplicate_physical_groups),
        "duplicate_physical_key_groups_with_conflicting_canonical_input": sum(len(group["digests"]) > 1 for group in duplicate_physical_groups),
        "exact_structural_row_duplicate_groups": sum(count > 1 for count in structural_counts.values()),
        "exact_structural_row_duplicate_excess_rows": sum(max(0, count - 1) for count in structural_counts.values()),
    }
    return metrics


def classify(metrics: dict[str, int]) -> tuple[str, bool]:
    if metrics["duplicate_turn_id_groups"] == 0:
        return "PRIVATE304_FAILURE_NOT_REPRODUCED", False
    if metrics["duplicate_turn_groups_spanning_multiple_sessions"] > 0 or metrics["duplicate_turn_groups_spanning_multiple_turn_numbers"] > 0:
        return "TURN_ID_COORDINATE_INCONSISTENT", False
    if metrics["duplicate_physical_key_groups_spanning_multiple_turn_ids"] > 0 or metrics["duplicate_physical_key_groups_spanning_multiple_turn_numbers"] > 0:
        return "NATIVE_PHYSICAL_COORDINATE_ALIAS_CONFLICT", False
    if metrics["duplicate_physical_key_groups_with_conflicting_canonical_input"] > 0:
        return "NATIVE_PHYSICAL_KEY_CONFLICT", False
    if metrics["turn_id_duplicates_remaining_after_physical_dedup_groups"] == 0:
        return "TURN_ID_DUPLICATION_EXPLAINED_BY_PHYSICAL_DUPLICATES", True
    if metrics["turn_id_duplicates_remaining_after_physical_dedup_groups"] > 0:
        return "TURN_ID_IS_TURN_COORDINATE_NOT_TOOLCALL_PRIMARY_KEY", True
    return "UNCLASSIFIED_INTEGRITY_GEOMETRY", False


def scan(parquet_path: str) -> dict[str, int]:
    dataset = ds.dataset(parquet_path, format="parquet")
    missing = sorted(set(COLUMNS) - set(dataset.schema.names))
    if missing:
        raise RuntimeError(f"pinned conversations schema missing required columns: {','.join(missing)}")
    scanner = dataset.scanner(
        columns=COLUMNS,
        filter=(ds.field("turn_type") == "tool_use") & (ds.field("tool_name") == "WebFetch"),
        batch_size=65_536,
        use_threads=True,
    )
    rows: list[dict[str, Any]] = []
    for batch in scanner.to_batches():
        rows.extend(batch.to_pylist())
    return aggregate_rows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.output)

    resource = os.environ.get("HF_OIDC_RESOURCE", "").strip()
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()
    if not resource:
        output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_NO_HF_OIDC_RESOURCE"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return
    if not request_url or not request_token:
        output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return

    try:
        oidc_token = prep.request_github_oidc_token(request_url, request_token)
        hf_token = prep.exchange_hf_user_token(oidc_token, resource)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, RuntimeError, ValueError, json.JSONDecodeError):
        output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return

    try:
        api = HfApi(token=hf_token)
        try:
            source = source_identity(api)
            with tempfile.TemporaryDirectory(prefix="seenrelay-private309-") as temp_dir:
                parquet_path = hf_hub_download(
                    repo_id=REPO,
                    repo_type="dataset",
                    filename=FILENAME,
                    revision=REVISION,
                    token=hf_token,
                    local_dir=temp_dir,
                )
                if os.path.getsize(parquet_path) != EXPECTED_SIZE:
                    raise RuntimeError("downloaded conversations.parquet logical size mismatch")
                metrics = scan(parquet_path)
        except GatedRepoError:
            report = blocked_report("ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE")
            report["authentication"]["oidc_exchange_succeeded"] = True
            output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            return
        except HfHubHTTPError as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (401, 403):
                report = blocked_report("ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE")
                report["authentication"]["oidc_exchange_succeeded"] = True
                output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
                return
            raise

        verdict, authorize = classify(metrics)
        report = {
            "schema": SCHEMA,
            "status": "DIAGNOSTIC_COMPLETE",
            "diagnostic_performed": True,
            "source": source,
            "authentication": {
                "method": "HUGGING_FACE_USER_CICD_OIDC",
                "oidc_exchange_succeeded": True,
                "authorized_content_access_succeeded": True,
            },
            "metrics": metrics,
            "verdict": verdict,
            "followup_measurement_preregistration_authorized": authorize,
            "privacy": privacy_block(),
            "interpretation": interpretation_block(),
        }
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({"status": "DIAGNOSTIC_COMPLETE", "verdict": verdict}, sort_keys=True))
    finally:
        oidc_token = None
        hf_token = None
        resource = ""


if __name__ == "__main__":
    main()
