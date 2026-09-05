#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run-private309-swechat-turnid-integrity.py"
spec = importlib.util.spec_from_file_location("private309", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def row(session, turn_number, call_id, payload, timestamp="2026-01-01T00:00:00Z", turn_id=None):
    return {
        "turn_type": "tool_use",
        "tool_name": "WebFetch",
        "session_id": session,
        "turn_id": turn_id if turn_id is not None else f"{session}#{turn_number}",
        "turn_number": turn_number,
        "tool_call_id": call_id,
        "timestamp": timestamp,
        "tool_input_json": payload,
    }


class Private309IntegrityTests(unittest.TestCase):
    def test_distinct_calls_in_one_turn_classify_turn_id_as_turn_coordinate(self):
        metrics = mod.aggregate_rows([
            row("s1", 7, "c1", '{"url":"https://a.example","prompt":"one"}'),
            row("s1", 7, "c2", '{"url":"https://b.example","prompt":"two"}'),
        ])
        self.assertEqual(metrics["duplicate_turn_id_groups"], 1)
        self.assertEqual(metrics["duplicate_turn_groups_with_multiple_physical_keys"], 1)
        self.assertEqual(metrics["turn_id_duplicates_remaining_after_physical_dedup_groups"], 1)
        self.assertEqual(metrics["duplicate_physical_key_groups"], 0)
        self.assertEqual(mod.classify(metrics), ("TURN_ID_IS_TURN_COORDINATE_NOT_TOOLCALL_PRIMARY_KEY", True))

    def test_identical_physical_duplicate_collapses_before_turn_uniqueness(self):
        r = row("s1", 7, "c1", '{"prompt":"one","url":"https://a.example"}')
        metrics = mod.aggregate_rows([r, dict(r)])
        self.assertEqual(metrics["duplicate_turn_id_groups"], 1)
        self.assertEqual(metrics["duplicate_physical_key_groups"], 1)
        self.assertEqual(metrics["duplicate_physical_key_groups_with_equal_canonical_input"], 1)
        self.assertEqual(metrics["turn_id_duplicates_remaining_after_physical_dedup_groups"], 0)
        self.assertEqual(metrics["exact_structural_row_duplicate_groups"], 1)
        self.assertEqual(mod.classify(metrics), ("TURN_ID_DUPLICATION_EXPLAINED_BY_PHYSICAL_DUPLICATES", True))

    def test_native_physical_key_with_conflicting_input_is_kill(self):
        metrics = mod.aggregate_rows([
            row("s1", 7, "c1", '{"url":"https://a.example","prompt":"one"}'),
            row("s1", 7, "c1", '{"url":"https://a.example","prompt":"different"}'),
        ])
        self.assertEqual(metrics["duplicate_physical_key_groups_with_conflicting_canonical_input"], 1)
        self.assertEqual(mod.classify(metrics), ("NATIVE_PHYSICAL_KEY_CONFLICT", False))

    def test_same_turn_id_spanning_sessions_is_kill(self):
        metrics = mod.aggregate_rows([
            row("s1", 7, "c1", '{"x":1}', turn_id="shared#7"),
            row("s2", 7, "c2", '{"x":2}', turn_id="shared#7"),
        ])
        self.assertEqual(metrics["duplicate_turn_groups_spanning_multiple_sessions"], 1)
        self.assertEqual(mod.classify(metrics), ("TURN_ID_COORDINATE_INCONSISTENT", False))

    def test_opaque_canonical_input_equality_ignores_json_key_order(self):
        metrics = mod.aggregate_rows([
            row("s1", 7, "c1", '{"a":1,"b":2}'),
            row("s1", 7, "c1", '{"b":2,"a":1}', timestamp="2026-01-01T00:00:01Z"),
        ])
        self.assertEqual(metrics["duplicate_physical_key_groups_with_equal_canonical_input"], 1)
        self.assertEqual(metrics["duplicate_physical_key_groups_with_conflicting_canonical_input"], 0)


if __name__ == "__main__":
    unittest.main()
