#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "run-private303-opencode-webfetch-geometry.py"
spec = importlib.util.spec_from_file_location("private303", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


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

    def test_manifest_digest_is_order_sensitive_but_caller_sorts(self):
        rows = [
            {"path": "data/run/a.json", "blob_id": "abc", "size": 10},
            {"path": "data/run/b.json", "blob_id": "def", "size": 20},
        ]
        self.assertEqual(module.manifest_digest(rows), module.manifest_digest(list(rows)))
        self.assertNotEqual(module.manifest_digest(rows), module.manifest_digest(list(reversed(rows))))


if __name__ == "__main__":
    unittest.main()
