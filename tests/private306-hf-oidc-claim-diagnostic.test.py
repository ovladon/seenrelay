#!/usr/bin/env python3
import base64
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run-private306-hf-oidc-claim-diagnostic.py"
spec = importlib.util.spec_from_file_location("private306", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fake_jwt(payload):
    def enc(value):
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return f"{enc({'alg':'none'})}.{enc(payload)}.signature"


class Private306Tests(unittest.TestCase):
    def test_only_allowlisted_claims_survive(self):
        payload = {
            "iss": "https://token.actions.githubusercontent.com",
            "aud": "https://huggingface.co",
            "repository": "ovladon/seenrelay",
            "repository_owner": "ovladon",
            "repository_visibility": "public",
            "event_name": "pull_request",
            "ref": "refs/pull/186/merge",
            "ref_type": "branch",
            "workflow": "SWE-chat full browser overlap OIDC (PRIVATE304)",
            "workflow_ref": "ovladon/seenrelay/.github/workflows/swechat-full-browser-overlap-oidc.yml@refs/pull/186/merge",
            "job_workflow_ref": None,
            "sub": "must-not-survive",
            "actor": "must-not-survive",
            "email": "must-not-survive@example.com",
        }
        decoded = mod.decode_payload_without_verification(fake_jwt(payload))
        filtered = mod.filtered_claims(decoded)
        self.assertEqual(set(filtered), set(mod.ALLOWLIST))
        encoded = json.dumps(filtered)
        self.assertNotIn("must-not-survive", encoded)
        self.assertNotIn("email", encoded)
        self.assertNotIn("actor", encoded)
        self.assertNotIn("sub", filtered)

    def test_malformed_jwt_fails_closed(self):
        with self.assertRaises(RuntimeError):
            mod.decode_payload_without_verification("not-a-jwt")

    def test_audience_is_pinned(self):
        self.assertEqual(mod.AUDIENCE, "https://huggingface.co")
        self.assertEqual(mod.EXCHANGE_URL, "https://huggingface.co/oauth/token")


if __name__ == "__main__":
    unittest.main()
