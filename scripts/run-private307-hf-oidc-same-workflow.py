#!/usr/bin/env python3
import argparse, base64, json, os, pathlib, urllib.error, urllib.parse, urllib.request

SCHEMA = "seenrelay-private307-hf-oidc-same-workflow-diagnostic-v1"
AUD = "https://huggingface.co"
ALLOW = ("iss","aud","repository","repository_owner","repository_visibility","event_name","ref","ref_type","workflow","workflow_ref","job_workflow_ref")


def oidc_token():
    u = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "").strip()
    t = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "").strip()
    if not u or not t:
        raise RuntimeError("GitHub OIDC environment unavailable")
    p = urllib.parse.urlsplit(u)
    q = urllib.parse.parse_qsl(p.query, keep_blank_values=True) + [("audience", AUD)]
    url = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), p.fragment))
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {t}", "Accept": "application/json", "User-Agent": "seenrelay-private307/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode())
    value = data.get("value") if isinstance(data, dict) else None
    if not isinstance(value, str) or not value:
        raise RuntimeError("GitHub OIDC endpoint did not return token")
    return value


def claims(jwt):
    parts = jwt.split(".")
    if len(parts) != 3:
        raise RuntimeError("invalid JWT")
    raw = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
    payload = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
    if not isinstance(payload, dict):
        raise RuntimeError("JWT payload not object")
    return {k: payload.get(k) for k in ALLOW}


def has_request_id(headers):
    if headers is None:
        return False
    names = {str(k).lower() for k in headers.keys()}
    return any(x in names for x in ("x-request-id","x-amzn-requestid","x-amz-cf-id","x-trace-id"))


def exchange(jwt, resource):
    body = json.dumps({
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "subject_token": jwt,
        "resource": resource,
    }, separators=(",", ":")).encode()
    req = urllib.request.Request("https://huggingface.co/oauth/token", data=body, method="POST", headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"seenrelay-private307/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode())
            token = data.get("access_token") if isinstance(data, dict) else None
            if not isinstance(token, str) or not token:
                raise RuntimeError("HF success response missing access token")
            return {"succeeded": True, "http_status": int(getattr(r, "status", 200)), "oauth_error": None, "request_id_present": has_request_id(getattr(r, "headers", None))}
    except urllib.error.HTTPError as e:
        err = None
        try:
            data = json.loads(e.read().decode())
            if isinstance(data, dict) and isinstance(data.get("error"), str):
                err = data["error"]
        except Exception:
            pass
        return {"succeeded": False, "http_status": int(e.code), "oauth_error": err, "request_id_present": has_request_id(e.headers)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    resource = os.environ.get("HF_OIDC_RESOURCE", "").strip()
    if not resource:
        raise RuntimeError("HF_OIDC_RESOURCE absent")
    jwt = oidc_token()
    report = {
        "schema": SCHEMA,
        "status": "DIAGNOSTIC_COMPLETE",
        "dataset_access_attempted": False,
        "github_oidc": {"audience_requested": AUD, "claims": claims(jwt)},
        "hugging_face_exchange": exchange(jwt, resource),
        "privacy": {
            "hf_oidc_resource_retained": False,
            "github_oidc_jwt_retained": False,
            "github_oidc_request_token_retained": False,
            "hf_access_token_retained": False,
            "subject_claim_retained": False,
            "non_allowlisted_claims_retained": False,
            "error_description_retained": False,
            "response_body_retained": False
        },
        "interpretation": {
            "private304_result_modified": False,
            "dataset_access_authorized": False,
            "production_change_authorized": False,
            "private285_pass_authorized": False
        }
    }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status":"DIAGNOSTIC_COMPLETE","exchange_succeeded":report["hugging_face_exchange"]["succeeded"],"oauth_error":report["hugging_face_exchange"]["oauth_error"]}, sort_keys=True))

if __name__ == "__main__":
    main()
