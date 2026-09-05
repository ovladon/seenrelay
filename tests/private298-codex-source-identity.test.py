#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private298-codex-source-identity.py'
spec = importlib.util.spec_from_file_location('private298_codex_source', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Private298Tests(unittest.TestCase):
    def test_session_row_definition_uses_top_level_identity_only(self):
        self.assertTrue(mod.is_session_row({'id': 'a' * 16, 'source': 'codex', 'messages': []}))
        self.assertFalse(mod.is_session_row({'id': '', 'source': 'codex', 'messages': []}))
        self.assertFalse(mod.is_session_row({'id': 'a' * 16, 'source': '', 'messages': []}))
        self.assertFalse(mod.is_session_row({'id': 'a' * 16, 'source': 'codex', 'messages': {}}))
        self.assertFalse(mod.is_session_row({'hash': 'bundle', 'metadata': {}}))

    def test_anonymized_id_pattern_is_frozen(self):
        self.assertIsNotNone(mod.ID_RE.fullmatch('0123456789abcdef'))
        self.assertIsNone(mod.ID_RE.fullmatch('0123456789abcde'))
        self.assertIsNone(mod.ID_RE.fullmatch('0123456789abcdeg'))
        self.assertIsNone(mod.ID_RE.fullmatch('SESSION-0123456789'))

    def test_duplicate_summary_counts_groups_and_extras(self):
        unique, groups, extras = mod.duplicate_summary(['a', 'a', 'b', 'c', 'c', 'c'])
        self.assertEqual((unique, groups, extras), (3, 2, 3))

    def test_admission_requires_exact_73_codex_unique_pattern_ids_and_no_row_duplicates(self):
        self.assertEqual(
            mod.classify(73, 73, 73, 73, 0, 0, True),
            'SOURCE_IDENTITY_ADMISSIBLE_FOR_TOOL_COUNT_FOLLOWUP',
        )
        cases = [
            (72, 72, 72, 72, 0, 0, True),
            (73, 72, 73, 73, 0, 0, True),
            (73, 73, 72, 73, 0, 0, True),
            (73, 73, 73, 72, 1, 0, True),
            (73, 73, 73, 73, 0, 1, True),
            (73, 73, 73, 73, 0, 0, False),
        ]
        for args in cases:
            self.assertEqual(mod.classify(*args), 'SOURCE_IDENTITY_NOT_ADMISSIBLE')


if __name__ == '__main__':
    unittest.main()
