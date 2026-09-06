#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private297-vtcode-source-geometry.py'
spec = importlib.util.spec_from_file_location('private297_vtcode_source', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Private297Tests(unittest.TestCase):
    def test_family_selection_is_filename_only_and_disjoint(self):
        self.assertEqual(mod.family_for_path('harness-session-a-20260401.jsonl'), 'harness')
        self.assertEqual(mod.family_for_path('atif-trajectory-session-a.json'), 'atif')
        self.assertEqual(mod.family_for_path('session-a.json'), 'session_summary')
        self.assertEqual(mod.family_for_path('other.jsonl'), 'other_data')
        self.assertEqual(mod.family_for_path('README.md'), 'readme')

    def test_extracts_only_native_thread_started_identity(self):
        raw = json.dumps({
            'lines': [
                {'schema_version': '0.4.0', 'event': {'type': 'thread.started', 'thread_id': 'session-native-1'}},
                {'schema_version': '0.4.0', 'event': {'type': 'item.started', 'item': {'type': 'tool_call', 'name': 'must-not-matter'}}},
            ]
        }).encode()
        self.assertEqual(mod.first_thread_id_from_harness(raw), 'session-native-1')

    def test_rejects_missing_or_wrong_first_event_for_aggregate_accounting(self):
        with self.assertRaises(RuntimeError):
            mod.first_thread_id_from_harness(json.dumps({'lines': []}).encode())
        with self.assertRaises(RuntimeError):
            mod.first_thread_id_from_harness(json.dumps({
                'lines': [{'event': {'type': 'turn.started', 'thread_id': 'x'}}]
            }).encode())
        with self.assertRaises(RuntimeError):
            mod.first_thread_id_from_harness(json.dumps({
                'lines': [{'event': {'type': 'thread.started'}}]
            }).encode())

    def test_duplicate_summary_counts_groups_and_extra_occurrences(self):
        unique, groups, extras = mod.duplicate_summary(['a', 'a', 'a', 'b', 'c', 'c'])
        self.assertEqual((unique, groups, extras), (3, 2, 3))

    def test_admission_requires_complete_identity_and_content_duplicate_safety(self):
        self.assertEqual(
            mod.classify(10, 10, 10, 0, 0, True),
            'SOURCE_IDENTITY_ADMISSIBLE_FOR_COUNT_ONLY_FOLLOWUP',
        )
        self.assertEqual(
            mod.classify(10, 9, 9, 0, 0, True),
            'SOURCE_IDENTITY_NOT_ADMISSIBLE',
        )
        self.assertEqual(
            mod.classify(10, 10, 9, 1, 0, True),
            'SOURCE_IDENTITY_NOT_ADMISSIBLE',
        )
        self.assertEqual(
            mod.classify(10, 10, 10, 0, 1, True),
            'SOURCE_IDENTITY_NOT_ADMISSIBLE',
        )
        self.assertEqual(
            mod.classify(1, 1, 1, 0, 0, True),
            'SOURCE_IDENTITY_NOT_ADMISSIBLE',
        )


if __name__ == '__main__':
    unittest.main()
