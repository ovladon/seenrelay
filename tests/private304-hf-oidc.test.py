#!/usr/bin/env python3
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREP_PATH = ROOT / "scripts" / "prepare-private304-hf-oidc.py"
RUN_PATH = ROOT / "scripts" / "run-private304-swechat-full-overlap.py"

prep_spec = importlib.util.spec_from_file_location("private304_oidc", PREP_PATH)
prep = importlib.util.module_from_spec(prep_spec)
prep_spec.loader.exec_module(prep)

run_spec = importlib.util.spec_from_file_location("private304_run", RUN_PATH)
run = importlib.util.module_from_spec(run_spec)
run_spec.loader.exec_module(run)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self.payload


class Private304OidcTests(unittest.TestCase):
    def test_blocked_report_has_closed_flags(self):
        report = prep.blocked_report("ACCESS_BLOCKED_NO_HF_OIDC_RESOURCE")
        self.assertFalse(report["measurement_performed"])
        self.assertFalse(report["authentication"]["oidc_exchange_succeeded"])
        self.assertFalse(report["authentication"]["authorized_content_access_succeeded"])
        self.assertFalse(report["authentication"]["static_hf_token_used"])
        self.assertTrue(all(value is False for value in report["privacy"].values()))
        self.assertTrue(all(value is False for value in report["interpretation"].values()))

    def test_exchange_rejection_report_does_not_leak_secret_values(self):
        secret_resource = "private304-secret-username-sentinel"
        secret_request_token = "private304-github-request-token-sentinel"
        secret_oidc_token = "private304-oidc-id-token-sentinel"

        with tempfile.TemporaryDirectory() as temp_dir:
            output = pathlib.Path(temp_dir) / "blocked.json"
            github_env = pathlib.Path(temp_dir) / "github-env"
            environment = {
                "HF_OIDC_RESOURCE": secret_resource,
                "ACTIONS_ID_TOKEN_REQUEST_URL": "https://token.example/id",
                "ACTIONS_ID_TOKEN_REQUEST_TOKEN": secret_request_token,
                "GITHUB_ENV": str(github_env),
                "RUNNER_TEMP": temp_dir,
            }
            with (
                mock.patch.dict(os.environ, environment, clear=False),
                mock.patch.object(prep, "request_github_oidc_token", return_value=secret_oidc_token),
                mock.patch.object(prep, "exchange_hf_user_token", side_effect=RuntimeError("synthetic exchange rejection")),
                mock.patch("sys.argv", ["prepare-private304-hf-oidc.py", "--blocked-output", str(output)]),
            ):
                prep.main()

            encoded = output.read_text(encoding="utf-8")
            report = json.loads(encoded)
            self.assertEqual(report["status"], "ACCESS_BLOCKED_OIDC_EXCHANGE_REJECTED")
            self.assertNotIn(secret_resource, encoded)
            self.assertNotIn(secret_request_token, encoded)
            self.assertNotIn(secret_oidc_token, encoded)
            self.assertFalse(report["measurement_performed"])

    def test_github_oidc_request_pins_hugging_face_audience(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["authorization"] = request.headers.get("Authorization")
            captured["timeout"] = timeout
            return FakeResponse(json.dumps({"value": "oidc-token"}).encode())

        with mock.patch.object(prep.urllib.request, "urlopen", side_effect=fake_urlopen):
            token = prep.request_github_oidc_token("https://token.example/id?x=1", "request-token")
        self.assertEqual(token, "oidc-token")
        self.assertIn("audience=https%3A%2F%2Fhuggingface.co", captured["url"])
        self.assertEqual(captured["authorization"], "Bearer request-token")
        self.assertEqual(captured["timeout"], 60)

    def test_hf_exchange_uses_documented_token_exchange_fields(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["body"] = json.loads(request.data.decode())
            captured["method"] = request.get_method()
            return FakeResponse(json.dumps({"access_token": "hf-short-lived"}).encode())

        with mock.patch.object(prep.urllib.request, "urlopen", side_effect=fake_urlopen):
            token = prep.exchange_hf_user_token("oidc-token", "example-user")
        self.assertEqual(token, "hf-short-lived")
        self.assertEqual(captured["url"], "https://huggingface.co/oauth/token")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["body"], {
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
            "subject_token": "oidc-token",
            "resource": "example-user",
        })

    def test_ephemeral_token_file_is_owner_read_write_only(self):
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.dict(os.environ, {"RUNNER_TEMP": temp_dir}):
            path = prep.persist_ephemeral_token("hf-short-lived")
            self.assertEqual(path.read_text(), "hf-short-lived")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_measured_wrapper_keeps_parent_measurement_interpretation_closed(self):
        source = {
            "dataset": run.parent.REPO,
            "resolved_revision": run.parent.REVISION,
            "filename": run.parent.FILENAME,
            "logical_size": run.parent.EXPECTED_SIZE,
            "git_blob_id": run.parent.EXPECTED_BLOB_ID,
        }
        report = run.measured_report(source, {"selected_webfetch_rows_before_physical_dedup": 1, "duplicate_physical_webfetch_records_removed": 0, "unique_physical_webfetch_calls": 1}, {"classification": "INSUFFICIENT_EXTERNAL_SAMPLE"})
        self.assertEqual(report["schema"], "seenrelay-private304-swechat-full-browser-overlap-oidc-v1")
        self.assertTrue(report["authentication"]["oidc_exchange_succeeded"])
        self.assertTrue(report["authentication"]["authorized_content_access_succeeded"])
        self.assertFalse(report["authentication"]["static_hf_token_used"])
        self.assertTrue(all(value is False for value in report["interpretation"].values()))


if __name__ == "__main__":
    unittest.main()
