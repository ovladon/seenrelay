#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest

import pyarrow as pa
import pyarrow.parquet as pq

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "run-private302-swechat-full-overlap.py"
spec = importlib.util.spec_from_file_location("private302_swechat_full", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def base_row(**overrides):
    row = {
        "turn_id": "s1#0",
        "session_id": "s1",
        "turn_number": 0,
        "turn_type": "tool_use",
        "tool_name": "WebFetch",
        "tool_call_id": "toolu_1",
        "tool_input_json": json.dumps({"url": "https://example.com/x", "prompt": "p", "ignored": 7}),
        "timestamp": "2026-01-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


def write_parquet(rows):
    tmp = tempfile.TemporaryDirectory()
    path = pathlib.Path(tmp.name) / "synthetic.parquet"
    pq.write_table(pa.Table.from_pylist(rows), path)
    return tmp, path


class Private302ExtractionTests(unittest.TestCase):
    def test_deterministic_input_bytes_is_order_independent_for_parsed_object(self):
        left = module.deterministic_input_bytes({"b": 2, "a": 1})
        right = module.deterministic_input_bytes({"a": 1, "b": 2})
        self.assertEqual(left, right)
        self.assertEqual(left, b'{"a":1,"b":2}')

    def test_rejects_non_object_tool_input(self):
        with self.assertRaisesRegex(RuntimeError, "JSON object"):
            module.deterministic_input_bytes([1, 2])

    def test_filters_webfetch_and_deduplicates_native_physical_key_before_turn_uniqueness(self):
        rows = [
            base_row(turn_id="s1#1", turn_number=1, timestamp="2026-01-01T00:00:02+00:00"),
            base_row(turn_id="s1#1", turn_number=1, timestamp="2026-01-01T00:00:01+00:00"),
            base_row(
                turn_id="s2#0",
                session_id="s2",
                tool_call_id="toolu_2",
                turn_number=0,
                timestamp="2026-01-01T00:00:03+00:00",
            ),
            base_row(
                turn_id="s3#0",
                session_id="s3",
                tool_call_id="toolu_3",
                turn_number=0,
                tool_name="Bash",
                tool_input_json=json.dumps({"command": "echo ignored"}),
            ),
            base_row(
                turn_id="s4#0",
                session_id="s4",
                tool_call_id="toolu_4",
                turn_number=0,
                tool_input_json=json.dumps({"url": "https://example.com/y", "ignored": "x"}),
            ),
        ]
        tmp, path = write_parquet(rows)
        try:
            calls, stats = module.scan_webfetch_calls(str(path))
        finally:
            tmp.cleanup()
        self.assertEqual(stats["selected_webfetch_rows_before_physical_dedup"], 4)
        self.assertEqual(stats["duplicate_physical_webfetch_records_removed"], 1)
        self.assertEqual(stats["unique_physical_webfetch_calls"], 3)
        s1 = [call for call in calls if call["session"] == "s1"]
        self.assertEqual(len(s1), 1)
        self.assertEqual(s1[0]["turn_id"], "s1#1")
        self.assertEqual(s1[0]["timestamp"], "2026-01-01T00:00:01+00:00")
        self.assertEqual(set(s1[0]), {"session", "turn_number", "turn_id", "timestamp", "raw_url", "raw_prompt"})

    def test_duplicate_physical_key_with_conflicting_payload_fails_closed(self):
        rows = [
            base_row(turn_id="s1#0", turn_number=0),
            base_row(
                turn_id="s1#0",
                turn_number=0,
                tool_input_json=json.dumps({"url": "https://different.example/x", "prompt": "p"}),
            ),
        ]
        tmp, path = write_parquet(rows)
        try:
            with self.assertRaisesRegex(RuntimeError, "inconsistent parsed tool input"):
                module.scan_webfetch_calls(str(path))
        finally:
            tmp.cleanup()

    def test_duplicate_physical_key_mapping_to_different_turn_fails_closed(self):
        rows = [
            base_row(turn_id="s1#0", turn_number=0),
            base_row(turn_id="s1#1", turn_number=1),
        ]
        tmp, path = write_parquet(rows)
        try:
            with self.assertRaisesRegex(RuntimeError, "maps to multiple turn coordinates"):
                module.scan_webfetch_calls(str(path))
        finally:
            tmp.cleanup()

    def test_duplicate_turn_id_after_physical_dedup_fails_closed(self):
        rows = [
            base_row(turn_id="s1#0", turn_number=0, tool_call_id="toolu_1"),
            base_row(turn_id="s1#0", turn_number=0, tool_call_id="toolu_2"),
        ]
        tmp, path = write_parquet(rows)
        try:
            with self.assertRaisesRegex(RuntimeError, "duplicate turn_id"):
                module.scan_webfetch_calls(str(path))
        finally:
            tmp.cleanup()

    def test_run_core_counts_cross_native_session_reuse(self):
        calls = [
            {"session": "s1", "turn_number": 0, "turn_id": "s1#0", "timestamp": "2026-01-01T00:00:00Z", "raw_url": "https://example.com/x", "raw_prompt": "p"},
            {"session": "s2", "turn_number": 0, "turn_id": "s2#0", "timestamp": "2026-01-01T00:00:01Z", "raw_url": "https://example.com/x#frag", "raw_prompt": " p "},
        ]
        result = module.run_core(calls)
        self.assertEqual(result["eligible_http_webfetch_calls"], 2)
        self.assertEqual(result["cross_session_exact_reuse_opportunities"], 1)
        self.assertEqual(result["classification"], "INSUFFICIENT_EXTERNAL_SAMPLE")


if __name__ == "__main__":
    unittest.main()
