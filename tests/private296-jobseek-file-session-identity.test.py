#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private296-jobseek-file-session-identity.py'
spec = importlib.util.spec_from_file_location('private296_file_session', SCRIPT_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Private296FileSessionIdentityTests(unittest.TestCase):
    def test_event_pair_hash_is_deterministic_and_delimited(self):
        a = module.event_pair_hash('ab', 'c')
        b = module.event_pair_hash('a', 'bc')
        self.assertNotEqual(a, b)
        self.assertEqual(a, module.event_pair_hash('ab', 'c'))

    def test_candidate_physical_hash_changes_with_file_boundary(self):
        pair = module.event_pair_hash('uuid', 'tool')
        self.assertNotEqual(
            module.candidate_physical_hash(1, pair),
            module.candidate_physical_hash(2, pair),
        )

    def test_supported_verdict_requires_every_duplicate_safety_condition(self):
        good = dict(
            files_processed=400,
            webfetch_records=9603,
            missing_uuid=0,
            missing_tool_id=0,
            duplicate_candidate_records=0,
            cross_file_pair_keys=0,
            duplicate_content_groups=0,
        )
        self.assertEqual(
            module.classify(**good),
            'FILE_SESSION_BOUNDARY_SUPPORTED_FOR_SEPARATE_OVERLAP_STUDY',
        )

        for field in (
            'missing_uuid',
            'missing_tool_id',
            'duplicate_candidate_records',
            'cross_file_pair_keys',
            'duplicate_content_groups',
        ):
            bad = dict(good)
            bad[field] = 1
            with self.subTest(field=field):
                self.assertEqual(
                    module.classify(**bad),
                    'FILE_SESSION_BOUNDARY_NOT_DUPLICATE_SAFE',
                )

        bad_files = dict(good)
        bad_files['files_processed'] = 399
        self.assertEqual(module.classify(**bad_files), 'FILE_SESSION_BOUNDARY_NOT_DUPLICATE_SAFE')

        bad_records = dict(good)
        bad_records['webfetch_records'] = 9602
        self.assertEqual(module.classify(**bad_records), 'FILE_SESSION_BOUNDARY_NOT_DUPLICATE_SAFE')


if __name__ == '__main__':
    unittest.main()
