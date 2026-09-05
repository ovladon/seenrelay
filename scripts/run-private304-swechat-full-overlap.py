#!/usr/bin/env python3
import argparse
import importlib.util
import json
import os
import pathlib
import tempfile
from typing import Any

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import GatedRepoError, HfHubHTTPError

PARENT_PATH = pathlib.Path(__file__).resolve().parent / "run-private302-swechat-full-overlap.py"
spec = importlib.util.spec_from_file_location("private302_frozen_measurement", PARENT_PATH)
parent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parent)

SCHEMA = "seenrelay-private304-swechat-full-browser-overlap-oidc-v1"


def privacy_block() -> dict[str, bool]:
    return {
        "hf_username_retained": False,
        "oidc_id_token_retained": False,
        "hf_access_token_retained": False,
        "raw_parquet_retained_in_artifact": False,
        "raw_urls_retained_in_artifact": False,
        "raw_prompts_retained_in_artifact": False,
        "session_ids_retained_in_artifact": False,
        "tool_call_ids_retained_in_artifact": False,
        "turn_ids_retained_in_artifact": False,
        "per_key_hashes_retained_in_artifact": False,
    }


def authentication_block(content_access: bool) -> dict[str, bool | str]:
    return {
        "method": "HUGGING_FACE_USER_CICD_OIDC",
        "oidc_exchange_succeeded": True,
        "authorized_content_access_succeeded": content_access,
        "static_hf_token_used": False,
        "gate_bypass_attempted": False,
        "fallback_dataset_used": False,
    }


def blocked_report(status: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": status,
        "measurement_performed": False,
        "source": {
            "dataset": parent.REPO,
            "resolved_revision": parent.REVISION,
            "filename": parent.FILENAME,
            "logical_size": parent.EXPECTED_SIZE,
            "git_blob_id": parent.EXPECTED_BLOB_ID,
        },
        "authentication": authentication_block(False),
        "interpretation": parent.interpretation_block(),
        "privacy": privacy_block(),
    }


def measured_report(source: dict[str, Any], extraction: dict[str, int], overlap: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "status": "MEASURED",
        "measurement_performed": True,
        "source": source,
        "authentication": authentication_block(True),
        "extraction": extraction,
        "overlap": overlap,
        "interpretation": parent.interpretation_block(),
        "privacy": privacy_block(),
    }


def read_ephemeral_token() -> tuple[str, pathlib.Path]:
    raw_path = os.environ.get("PRIVATE304_HF_TOKEN_FILE", "").strip()
    if not raw_path:
        raise RuntimeError("PRIVATE304 ephemeral token path is unavailable")
    path = pathlib.Path(raw_path)
    token = path.read_text(encoding="utf-8").strip()
    if not token:
        raise RuntimeError("PRIVATE304 ephemeral token file is empty")
    return token, path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.output)

    token, token_path = read_ephemeral_token()
    try:
        api = HfApi(token=token)
        try:
            source = parent.source_identity(api)
            with tempfile.TemporaryDirectory(prefix="seenrelay-private304-") as temp_dir:
                parquet_path = hf_hub_download(
                    repo_id=parent.REPO,
                    repo_type="dataset",
                    filename=parent.FILENAME,
                    revision=parent.REVISION,
                    token=token,
                    local_dir=temp_dir,
                )
                if os.path.getsize(parquet_path) != parent.EXPECTED_SIZE:
                    raise RuntimeError("downloaded conversations.parquet logical size mismatch")
                calls, extraction = parent.scan_webfetch_calls(parquet_path)
                overlap = parent.run_core(calls)
        except GatedRepoError:
            output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(json.dumps({"status": "ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE"}))
            return
        except HfHubHTTPError as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in (401, 403):
                output.write_text(json.dumps(blocked_report("ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE"), indent=2, sort_keys=True) + "\n", encoding="utf-8")
                print(json.dumps({"status": "ACCESS_BLOCKED_GATED_DATASET_NOT_ACCESSIBLE"}))
                return
            raise

        report = measured_report(source, extraction, overlap)
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({
            "status": "MEASURED",
            "classification": overlap.get("classification"),
            "eligible_http_webfetch_calls": overlap.get("eligible_http_webfetch_calls"),
        }, sort_keys=True))
    finally:
        try:
            token_path.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    main()
