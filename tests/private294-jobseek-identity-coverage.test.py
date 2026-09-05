import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private294-jobseek-identity-coverage.py'
spec = importlib.util.spec_from_file_location('private294_jobseek', MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Private294Tests(unittest.TestCase):
    def test_presence_mask_requires_nonempty_strings(self):
        self.assertEqual(mod.presence_mask('s', 'u', 't'), '111')
        self.assertEqual(mod.presence_mask('', 'u', 't'), '011')
        self.assertEqual(mod.presence_mask('s', '   ', 't'), '101')
        self.assertEqual(mod.presence_mask('s', 'u', None), '110')
        self.assertEqual(mod.presence_mask(None, None, None), '000')

    def test_session_only_gap_dominance_threshold_is_frozen_at_95_percent(self):
        counts = {'011': 950, '101': 25, '110': 25}
        self.assertEqual(mod.classify_missing(counts, 1000), 'SESSION_ID_ONLY_DOMINANT_GAP')
        counts = {'011': 949, '101': 26, '110': 25}
        self.assertEqual(mod.classify_missing(counts, 1000), 'MIXED_IDENTITY_GAPS')

    def test_other_single_field_and_mixed_classifications(self):
        self.assertEqual(mod.classify_missing({'101': 95, '011': 5}, 100), 'ASSISTANT_UUID_ONLY_DOMINANT_GAP')
        self.assertEqual(mod.classify_missing({'110': 95, '011': 5}, 100), 'TOOL_USE_ID_ONLY_DOMINANT_GAP')
        self.assertEqual(mod.classify_missing({'011': 40, '101': 30, '110': 30}, 100), 'MIXED_IDENTITY_GAPS')
        self.assertEqual(mod.classify_missing({}, 0), 'NO_MISSING_IDENTITY_RECORDS')


if __name__ == '__main__':
    unittest.main()
