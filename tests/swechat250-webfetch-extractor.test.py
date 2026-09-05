import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "extract-swechat250-webfetch.py"
SPEC = importlib.util.spec_from_file_location("extract_swechat250_webfetch", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class TrapToolResult(dict):
    def get(self, key, default=None):
        if key != "type":
            raise AssertionError(f"tool_result field accessed: {key}")
        return super().get(key, default)


class ExtractorTests(unittest.TestCase):
    def test_extracts_only_exact_webfetch_tool_use(self):
        transcript = [
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "ignore"},
                    {"type": "tool_use", "name": "WebSearch", "input": {"query": "x"}},
                    {
                        "type": "tool_use",
                        "name": "WebFetch",
                        "input": {"url": "https://example.com/a", "prompt": "verify a", "other": "discard"},
                    },
                    {"type": "tool_use", "name": "webfetch", "input": {"url": "https://wrong", "prompt": "wrong"}},
                ],
            }
        ]
        events = MODULE.extract_webfetch_events(transcript)
        self.assertEqual(len(events), 1)
        block = events[0]["message"]["content"][0]
        self.assertEqual(block["name"], "WebFetch")
        self.assertEqual(block["input"], {"url": "https://example.com/a", "prompt": "verify a"})

    def test_supports_contexts_messages_shape_without_metadata_identity(self):
        transcript = {
            "contexts": [
                {
                    "repo_id": "must-not-matter",
                    "cwd": "/private/path",
                    "messages": [
                        {
                            "role": "assistant",
                            "timestamp": "2026-01-01T00:00:00Z",
                            "content": [
                                {
                                    "type": "tool_use",
                                    "name": "WebFetch",
                                    "input": {"url": "https://example.com", "prompt": "p"},
                                }
                            ],
                        }
                    ],
                }
            ]
        }
        events = MODULE.extract_webfetch_events(transcript)
        self.assertEqual(len(events), 1)
        serialized = repr(events)
        self.assertNotIn("must-not-matter", serialized)
        self.assertNotIn("/private/path", serialized)

    def test_tool_result_payload_is_never_inspected(self):
        trap = TrapToolResult({"type": "tool_result", "content": "secret", "tool_use_id": "x"})
        transcript = [
            {
                "role": "assistant",
                "content": [
                    trap,
                    {"type": "tool_use", "name": "WebFetch", "input": {"url": "https://example.com", "prompt": "p"}},
                ],
            }
        ]
        events = MODULE.extract_webfetch_events(transcript)
        self.assertEqual(len(events), 1)

    def test_missing_arguments_are_not_inferred_from_free_text(self):
        transcript = [
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Fetch https://example.com and summarize it"},
                    {"type": "tool_use", "name": "WebFetch", "input": {}},
                ],
            }
        ]
        events = MODULE.extract_webfetch_events(transcript)
        self.assertEqual(events[0]["message"]["content"][0]["input"], {"url": None, "prompt": None})

    def test_unknown_transcript_shape_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "unrecognized transcript object shape"):
            MODULE.extract_webfetch_events({"turns": []})

    def test_non_assistant_messages_do_not_create_calls(self):
        transcript = [
            {
                "role": "user",
                "content": [
                    {"type": "tool_use", "name": "WebFetch", "input": {"url": "https://example.com", "prompt": "p"}}
                ],
            }
        ]
        self.assertEqual(MODULE.extract_webfetch_events(transcript), [])


if __name__ == "__main__":
    unittest.main()
