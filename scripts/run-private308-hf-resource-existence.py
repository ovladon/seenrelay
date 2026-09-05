#!/usr/bin/env python3
import argparse, json, os, pathlib, urllib.error, urllib.parse, urllib.request

SCHEMA = "seenrelay-private308-hf-resource-existence-v1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    resource = os.environ.get("HF_OIDC_RESOURCE", "").strip()
    if not resource:
        report = {
            "schema": SCHEMA,
            "status": "DIAGNOSTIC_COMPLETE",
            "resource_nonempty": False,
            "resource_has_slash": False,
            "http_status": None,
            "user_exists": False,
            "dataset_access_attempted": False,
            "privacy": {"resource_retained": False, "response_body_retained": False, "profile_fields_retained": False, "token_used": False},
            "interpretation": {"private304_result_modified": False, "dataset_access_authorized": False, "production_change_authorized": False, "private285_pass_authorized": False}
        }
    else:
        url = "https://huggingface.co/api/users/" + urllib.parse.quote(resource, safe="") + "/overview"
        status = None
        exists = False
        req = urllib.request.Request(url, headers={"Accept":"application/json","User-Agent":"seenrelay-private308/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = int(getattr(resp, "status", 200))
                resp.read(1)
                exists = status == 200
        except urllib.error.HTTPError as exc:
            status = int(exc.code)
            exists = False
        report = {
            "schema": SCHEMA,
            "status": "DIAGNOSTIC_COMPLETE",
            "resource_nonempty": True,
            "resource_has_slash": "/" in resource,
            "http_status": status,
            "user_exists": exists,
            "dataset_access_attempted": False,
            "privacy": {"resource_retained": False, "response_body_retained": False, "profile_fields_retained": False, "token_used": False},
            "interpretation": {"private304_result_modified": False, "dataset_access_authorized": False, "production_change_authorized": False, "private285_pass_authorized": False}
        }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status":"DIAGNOSTIC_COMPLETE","user_exists":report["user_exists"],"http_status":report["http_status"]}, sort_keys=True))

if __name__ == "__main__":
    main()
