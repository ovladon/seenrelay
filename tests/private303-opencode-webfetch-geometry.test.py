#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "run-private303-opencode-webfetch-geometry.py"
spec = importlib.util.spec_from_file_location("private303", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self.payload


class Private303Tests(unittest.TestCase):
    def test_counts_only_native_webfetch_tool_parts(self):
        doc = {
            "info": {"id": "ses_1"},
            "messages": [{
                "parts": [
                    {"type": "tool", "tool": "webfetch", "callID": "c1", "sessionID": "ses_1", "state": {"input": {"url": "SECRET"}}},
                    {"type": "tool", "tool": "bash", "callID": "c2", "sessionID": "ses_1"},
                    {"type": "text", "text": "webfetch"},
                ]
            }]
        }
        result = module.inspect_session(doc)
        self.assertEqual(result["all_tool_parts"], 2)
        self.assertEqual(result["webfetch_calls"], 1)
        self.assertEqual(result["duplicate_physical_webfetch_keys"], 0)

    def test_rejects_webfetch_session_mismatch(self):
        doc = {
            "info": {"id": "ses_1"},
            "parts": [{"type": "tool", "tool": "webfetch", "callID": "c1", "sessionID": "ses_other"}],
        }
        with self.assertRaisesRegex(RuntimeError, "differs"):
            module.inspect_session(doc)

    def test_rejects_missing_webfetch_call_id(self):
        doc = {
            "info": {"id": "ses_1"},
            "parts": [{"type": "tool", "tool": "webfetch", "sessionID": "ses_1"}],
        }
        with self.assertRaisesRegex(RuntimeError, "callID"):
            module.inspect_session(doc)

    def test_detects_duplicate_native_physical_key(self):
        doc = {
            "info": {"id": "ses_1"},
            "parts": [
                {"type": "tool", "tool": "webfetch", "callID": "c1", "sessionID": "ses_1"},
                {"type": "tool", "tool": "webfetch", "callID": "c1", "sessionID": "ses_1"},
            ],
        }
        result = module.inspect_session(doc)
        self.assertEqual(result["webfetch_calls"], 2)
        self.assertEqual(result["duplicate_physical_webfetch_keys"], 1)

    def test_manifest_digest_uses_content_hash_and_is_order_sensitive(self):
        rows = [
            {"path": "data/run/a.json", "sha256": "a" * 64, "size": 10},
            {"path": "data/run/b.json", "sha256": "b" * 64, "size": 20},
        ]
        self.assertEqual(module.manifest_digest(rows), module.manifest_digest(list(rows)))
        self.assertNotEqual(module.manifest_digest(rows), module.manifest_digest(list(reversed(rows))))

    def test_session_paths_uses_only_data_json_and_sorts(self):
        class Item:
            def __init__(self, name):
                self.rfilename = name

        class Info:
            siblings = [Item("README.md"), Item("data/z/s2.json"), Item("data/a/s1.json"), Item("data/a/note.txt")]

        self.assertEqual(module.session_paths(Info()), ["data/a/s1.json", "data/z/s2.json"])

    def test_empty_body_retries_within_same_frozen_budget(self):
        with mock.patch.object(
            module.urllib.request,
            "urlopen",
            side_effect=[FakeResponse(b""), FakeResponse(b'{"info":{"id":"ses_1"}}')],
        ) as urlopen, mock.patch.object(module.time, "sleep") as sleep:
            payload = module.download_exact_bytes("data/run/s1.json", "a" * 40)
        self.assertEqual(payload, b'{"info":{"id":"ses_1"}}')
        self.assertEqual(urlopen.call_count, 2)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1.0, 0.25])


if __name__ == "__main__":
    unittest.main()
