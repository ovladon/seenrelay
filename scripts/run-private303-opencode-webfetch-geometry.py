#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import tempfile
from typing import Any, Iterable

from huggingface_hub import HfApi, hf_hub_download

REPO = "dacorvo/hf-hub-session-opencode-traces"
REQUESTED_REVISION = "main"
EXPECTED_LICENSE = "apache-2.0"
SCHEMA = "seenrelay-private303-opencode-webfetch-geometry-v1"


def nonempty_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def session_paths(info: Any) -> list[str]:
    paths = []
    for item in getattr(info, "siblings", None) or []:
        path = getattr(item, "rfilename", None) or getattr(item, "path", None)
        if isinstance(path, str) and path.startswith("data/") and path.endswith(".json"):
            paths.append(path)
    paths = sorted(set(paths), key=lambda value: value.encode("utf-8"))
    if not paths:
        raise RuntimeError("no OpenCode session JSON files found under data/")
    return paths


def manifest_digest(rows: list[dict[str, Any]]) -> str:
    canonical = "".join(
        f"{row['path']}\0{row['size']}\0{row['sha256']}\n" for row in rows
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_dicts(child)


def inspect_session(document: Any) -> dict[str, int]:
    if not isinstance(document, dict):
        raise RuntimeError("OpenCode session export must be a JSON object")
    info = document.get("info")
    if not isinstance(info, dict):
        raise RuntimeError("OpenCode session export missing top-level info object")
    session_id = nonempty_string(info.get("id"))
    if not session_id:
        raise RuntimeError("OpenCode session export missing native info.id")

    webfetch_calls = 0
    duplicate_physical = 0
    seen_physical: set[tuple[str, str]] = set()
    all_tool_parts = 0

    for obj in iter_dicts(document):
        if obj.get("type") != "tool":
            continue
        tool_name = obj.get("tool")
        if not isinstance(tool_name, str):
            continue
        all_tool_parts += 1
        if tool_name != "webfetch":
            continue
        webfetch_calls += 1
        part_session = nonempty_string(obj.get("sessionID"))
        call_id = nonempty_string(obj.get("callID"))
        if not part_session:
            raise RuntimeError("webfetch tool part missing native sessionID")
        if part_session != session_id:
            raise RuntimeError("webfetch tool part sessionID differs from top-level info.id")
        if not call_id:
            raise RuntimeError("webfetch tool part missing native callID")
        physical = (part_session, call_id)
        if physical in seen_physical:
            duplicate_physical += 1
        else:
            seen_physical.add(physical)

    return {
        "all_tool_parts": all_tool_parts,
        "webfetch_calls": webfetch_calls,
        "duplicate_physical_webfetch_keys": duplicate_physical,
    }


def license_name(info: Any) -> str | None:
    card = getattr(info, "card_data", None)
    if card is None:
        return None
    if isinstance(card, dict):
        value = card.get("license")
    else:
        value = getattr(card, "license", None)
    if isinstance(value, list):
        return value[0] if len(value) == 1 and isinstance(value[0], str) else None
    return value if isinstance(value, str) else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    api = HfApi()
    info = api.dataset_info(REPO, revision=REQUESTED_REVISION, files_metadata=True)
    revision = getattr(info, "sha", None)
    if not isinstance(revision, str) or not revision:
        raise RuntimeError("failed to resolve exact source revision")
    source_license = license_name(info)
    if source_license != EXPECTED_LICENSE:
        raise RuntimeError("dataset license metadata differs from preregistered requirement")

    paths = session_paths(info)
    locked_rows: list[dict[str, Any]] = []
    files_processed = 0
    sessions_with_webfetch = 0
    webfetch_calls = 0
    all_tool_parts = 0
    duplicate_physical = 0

    with tempfile.TemporaryDirectory(prefix="seenrelay-private303-") as temp_dir:
        for source_path in paths:
            local_path = hf_hub_download(
                repo_id=REPO,
                repo_type="dataset",
                filename=source_path,
                revision=revision,
                local_dir=temp_dir,
            )
            payload = pathlib.Path(local_path).read_bytes()
            if not payload:
                raise RuntimeError("downloaded empty OpenCode session file")
            locked_rows.append({
                "path": source_path,
                "size": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            })
            try:
                document = json.loads(payload.decode("utf-8", errors="strict"))
            except Exception as exc:
                raise RuntimeError("invalid UTF-8/JSON OpenCode session export") from exc
            geometry = inspect_session(document)
            files_processed += 1
            all_tool_parts += geometry["all_tool_parts"]
            webfetch_calls += geometry["webfetch_calls"]
            duplicate_physical += geometry["duplicate_physical_webfetch_keys"]
            if geometry["webfetch_calls"] > 0:
                sessions_with_webfetch += 1

    if files_processed != len(paths):
        raise RuntimeError("did not process all locked session files")
    total_bytes = sum(row["size"] for row in locked_rows)
    digest = manifest_digest(locked_rows)

    if duplicate_physical > 0:
        decision = "REJECT_SOURCE_IDENTITY_GEOMETRY_FAILURE"
    elif webfetch_calls < 100:
        decision = "REJECT_SOURCE_INSUFFICIENT_WEBFETCH_GEOMETRY"
    else:
        decision = "AUTHORIZE_SEPARATE_OPENCODE_IDENTITY_PREREGISTRATION_ONLY"

    report = {
        "schema": SCHEMA,
        "source": {
            "dataset": REPO,
            "requested_revision": REQUESTED_REVISION,
            "resolved_revision": revision,
            "license": source_license,
            "session_json_files": len(paths),
            "total_logical_bytes": total_bytes,
            "manifest_sha256": digest,
            "manifest_identity": "sorted path + NUL + downloaded byte count + NUL + content SHA-256 + LF",
        },
        "geometry": {
            "files_processed": files_processed,
            "native_sessions_validated": files_processed,
            "all_tool_parts_seen": all_tool_parts,
            "webfetch_tool_calls": webfetch_calls,
            "sessions_with_webfetch": sessions_with_webfetch,
            "duplicate_native_physical_webfetch_keys": duplicate_physical,
        },
        "decision": {
            "sample_floor_webfetch_calls": 100,
            "verdict": decision,
            "separate_opencode_overlap_study_authorized": decision == "AUTHORIZE_SEPARATE_OPENCODE_IDENTITY_PREREGISTRATION_ONLY",
            "claude_webfetch_pooling_authorized": False,
        },
        "ingestion": {
            "webfetch_input_fields_accessed": False,
            "webfetch_output_or_error_fields_accessed": False,
            "operation_identity_constructed": False,
            "overlap_computed": False,
        },
        "privacy": {
            "raw_files_retained_in_artifact": False,
            "file_paths_retained_in_artifact": False,
            "session_ids_retained_in_artifact": False,
            "call_ids_retained_in_artifact": False,
            "urls_retained_in_artifact": False,
            "tool_inputs_retained_in_artifact": False,
            "tool_outputs_retained_in_artifact": False,
        },
        "interpretation": {
            "geometry_is_reuse_evidence": False,
            "population_prevalence_evidence": False,
            "observer_independence_proven": False,
            "private285_class_pass_authorized": False,
            "seenrelay_reuse_authorized": False,
            "production_change_authorized": False,
        },
    }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "session_json_files": len(paths),
        "webfetch_tool_calls": webfetch_calls,
        "sessions_with_webfetch": sessions_with_webfetch,
        "verdict": decision,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
