#!/usr/bin/env python3
import argparse
import base64
import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

SCHEMA = "seenrelay-private306-hf-oidc-claim-diagnostic-v1"
AUDIENCE = "https://huggingface.co"
EXCHANGE_URL = "https://huggingface.co/oauth/token"
ALLOWLIST = (
    "iss",
    "aud",
    "repository",
    "repository_owner",
    "repository_visibility",
    "event_name",
    "ref",
    "ref_type",
    "workflow",
    "workflow_ref",
    "job_workflow_ref",
)


def decode_payload_without_verification(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise RuntimeError("GitHub OIDC token is not a JWT")
    raw = parts[1]
    raw += "=" * ((4 - len(raw) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(raw.encode("ascii"))
        payload = json.loads(decoded.decode("utf-8", errors="strict"))
    except Exception as exc:
        raise RuntimeError("GitHub OIDC JWT payload is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("GitHub OIDC JWT payload is not an object")
    return payload


def filtered_claims(payload: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in ALLOWLIST:
        value = payload.get(key)
        if value is None:
            result[key] = None
        elif isinstance(value, (str, bool, int, float)):
            result[key] = value
        elif key == "aud" and isinstance(value, list) and all(isinstance(item, str) for item in value):
            result[key] = value
        else:
            raise RuntimeError(f"unexpected type for allowlisted OIDC claim {key}")
    return result


def request_github_oidc() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()
    if not request_url or not request_token:
        raise RuntimeError("GitHub OIDC request environment is unavailable")
    parsed = urllib.parse.urlsplit(request_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("audience", AUDIENCE))
    url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), parsed.fragment))
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {request_token}",
            "Accept": "application/json",
            "User-Agent": "seenrelay-private306/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8", errors="strict"))
    token = payload.get("value") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise RuntimeError("GitHub OIDC endpoint did not return an ID token")
    return token


def request_id_present(headers: Any) -> bool:
    if headers is None:
        return False
    names = {str(k).lower() for k in headers.keys()}
    return any(name in names for name in ("x-request-id", "x-amzn-requestid", "x-amz-cf-id", "x-trace-id"))


def exchange(oidc_token: str, resource: str) -> dict[str, Any]:
    body = json.dumps({
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "subject_token": oidc_token,
        "resource": resource,
    }, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        EXCHANGE_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "seenrelay-private306/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8", errors="strict"))
            access_token = payload.get("access_token") if isinstance(payload, dict) else None
            if not isinstance(access_token, str) or not access_token:
                raise RuntimeError("Hugging Face exchange success response lacks access token")
            return {
                "succeeded": True,
                "http_status": getattr(response, "status", 200),
                "oauth_error": None,
                "request_id_present": request_id_present(getattr(response, "headers", None)),
            }
    except urllib.error.HTTPError as exc:
        oauth_error = None
        try:
            body_payload = json.loads(exc.read().decode("utf-8", errors="strict"))
            if isinstance(body_payload, dict) and isinstance(body_payload.get("error"), str):
                oauth_error = body_payload["error"]
        except Exception:
            oauth_error = None
        return {
            "succeeded": False,
            "http_status": int(exc.code),
            "oauth_error": oauth_error,
            "request_id_present": request_id_present(exc.headers),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    resource = os.environ.get("HF_OIDC_RESOURCE", "").strip()
    if not resource:
        raise RuntimeError("HF_OIDC_RESOURCE is absent")

    oidc_token = request_github_oidc()
    claims = filtered_claims(decode_payload_without_verification(oidc_token))
    exchange_result = exchange(oidc_token, resource)

    report = {
        "schema": SCHEMA,
        "status": "DIAGNOSTIC_COMPLETE",
        "dataset_access_attempted": False,
        "github_oidc": {
            "audience_requested": AUDIENCE,
            "claims": claims,
        },
        "hugging_face_exchange": exchange_result,
        "privacy": {
            "hf_oidc_resource_retained": False,
            "github_oidc_jwt_retained": False,
            "github_oidc_request_token_retained": False,
            "hf_access_token_retained": False,
            "subject_claim_retained": False,
            "non_allowlisted_claims_retained": False,
            "error_description_retained": False,
            "response_body_retained": False,
        },
        "interpretation": {
            "private304_result_modified": False,
            "dataset_access_authorized": False,
            "production_change_authorized": False,
            "private285_pass_authorized": False,
        },
    }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "DIAGNOSTIC_COMPLETE", "exchange_succeeded": exchange_result["succeeded"], "oauth_error": exchange_result["oauth_error"]}, sort_keys=True))


if __name__ == "__main__":
    main()
