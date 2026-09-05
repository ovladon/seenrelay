#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import stat
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

SCHEMA = "seenrelay-private304-swechat-full-browser-overlap-oidc-v1"
OIDC_AUDIENCE = "https://huggingface.co"
HF_EXCHANGE_URL = "https://huggingface.co/oauth/token"
SOURCE = {
    "dataset": "SALT-NLP/SWE-chat",
    "resolved_revision": "f66cca95b14caaa4177f7ed5eaa424608dadcffa",
    "filename": "conversations.parquet",
    "logical_size": 1311422253,
    "git_blob_id": "e8c76683b25698fc4312baf45fa6cb2297773946",
}


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
        "source": dict(SOURCE),
        "authentication": {
            "method": "HUGGING_FACE_USER_CICD_OIDC",
            "oidc_exchange_succeeded": False,
            "authorized_content_access_succeeded": False,
            "static_hf_token_used": False,
            "gate_bypass_attempted": False,
            "fallback_dataset_used": False,
        },
        "interpretation": interpretation_block(),
        "privacy": privacy_block(),
    }


def write_json(path: str | pathlib.Path, value: dict[str, Any]) -> None:
    pathlib.Path(path).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def append_github_env(name: str, value: str) -> None:
    env_path = os.environ.get("GITHUB_ENV", "").strip()
    if not env_path:
        return
    with open(env_path, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def request_github_oidc_token(request_url: str, request_token: str) -> str:
    parsed = urllib.parse.urlsplit(request_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("audience", OIDC_AUDIENCE))
    url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), parsed.fragment))
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {request_token}",
            "Accept": "application/json",
            "User-Agent": "seenrelay-private304-oidc/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8", errors="strict"))
    token = payload.get("value") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise RuntimeError("GitHub OIDC endpoint did not return an ID token")
    return token


def exchange_hf_user_token(oidc_token: str, resource: str) -> str:
    body = json.dumps({
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "subject_token": oidc_token,
        "resource": resource,
    }, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        HF_EXCHANGE_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "seenrelay-private304-oidc/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8", errors="strict"))
    token = payload.get("access_token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise RuntimeError("Hugging Face OIDC exchange did not return an access token")
    return token


def persist_ephemeral_token(token: str) -> pathlib.Path:
    runner_temp = os.environ.get("RUNNER_TEMP", "").strip()
    if not runner_temp:
        raise RuntimeError("RUNNER_TEMP is unavailable")
    path = pathlib.Path(runner_temp) / "private304-hf-token"
    path.write_text(token, encoding="utf-8")
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blocked-output", required=True)
    args = parser.parse_args()

    resource = os.environ.get("HF_OIDC_RESOURCE", "").strip()
    append_github_env("PRIVATE304_OIDC_READY", "false")

    if not resource:
        write_json(args.blocked_output, blocked_report("ACCESS_BLOCKED_NO_HF_OIDC_RESOURCE"))
        print(json.dumps({"status": "ACCESS_BLOCKED_NO_HF_OIDC_RESOURCE"}))
        return

    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()
    if not request_url or not request_token:
        write_json(args.blocked_output, blocked_report("ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"))
        print(json.dumps({"status": "ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"}))
        return

    try:
        oidc_token = request_github_oidc_token(request_url, request_token)
        hf_token = exchange_hf_user_token(oidc_token, resource)
        token_path = persist_ephemeral_token(hf_token)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, RuntimeError, ValueError, json.JSONDecodeError):
        write_json(args.blocked_output, blocked_report("ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"))
        print(json.dumps({"status": "ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED"}))
        return

    append_github_env("PRIVATE304_OIDC_READY", "true")
    append_github_env("PRIVATE304_HF_TOKEN_FILE", str(token_path))
    print(json.dumps({"status": "OIDC_READY"}))


if __name__ == "__main__":
    main()
