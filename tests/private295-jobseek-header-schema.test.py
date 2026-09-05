#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest
from collections import Counter, defaultdict

SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private295-jobseek-header-schema.py'
spec = importlib.util.spec_from_file_location('private295_header_schema', SCRIPT_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Private295HeaderSchemaTests(unittest.TestCase):
    def test_json_type_distinguishes_boolean_from_number(self):
        cases = [
            (None, 'null'),
            (False, 'boolean'),
            (True, 'boolean'),
            (0, 'number'),
            (1.5, 'number'),
            ('x', 'string'),
            ([], 'array'),
            ({}, 'object'),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(module.json_type(value), expected)

    def test_inventory_records_names_presence_and_types_only(self):
        presence = Counter()
        type_counts = defaultdict(Counter)
        header = {
            '_trace_header': True,
            'alpha': 'secret-value-not-retained',
            'beta': 7,
            'gamma': {'nested': 'never emitted'},
        }
        module.inventory_header(header, presence, type_counts)
        self.assertEqual(presence, Counter({'_trace_header': 1, 'alpha': 1, 'beta': 1, 'gamma': 1}))
        self.assertEqual(type_counts['_trace_header'], Counter({'boolean': 1}))
        self.assertEqual(type_counts['alpha'], Counter({'string': 1}))
        self.assertEqual(type_counts['beta'], Counter({'number': 1}))
        self.assertEqual(type_counts['gamma'], Counter({'object': 1}))
        serialized_counts = repr((presence, type_counts))
        self.assertNotIn('secret-value-not-retained', serialized_counts)
        self.assertNotIn('never emitted', serialized_counts)

    def test_inventory_rejects_non_header_record(self):
        for candidate in ({}, {'_trace_header': False}, [], None):
            with self.subTest(candidate=candidate):
                with self.assertRaises(RuntimeError):
                    module.inventory_header(candidate, Counter(), defaultdict(Counter))


if __name__ == '__main__':
    unittest.main()
