#!/usr/bin/env python3
import importlib.util
import pathlib
import types
import unittest

SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'lock-private301-swechat-source.py'
spec = importlib.util.spec_from_file_location('private301_source_lock', SCRIPT_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Private301SourceLockTests(unittest.TestCase):
    def test_card_license_dict(self):
        self.assertEqual(module.card_license({'license': 'odc-by'}), 'odc-by')
        self.assertIsNone(module.card_license({}))
        self.assertIsNone(module.card_license(None))

    def test_normalize_lfs_whitelists_metadata_only(self):
        raw = {'sha256': 'a' * 64, 'size': 123, 'pointer_size': 127, 'extra': 'forbidden'}
        self.assertEqual(
            module.normalize_lfs(raw),
            {'sha256': 'a' * 64, 'size': 123, 'pointer_size': 127},
        )

    def test_normalize_file_keeps_only_source_identity_metadata(self):
        item = types.SimpleNamespace(
            path='conversations.parquet',
            size=1234,
            blob_id='b' * 40,
            lfs={'sha256': 'c' * 64, 'size': 1234},
            xet_hash='xet-example',
            sensitive='must-not-appear',
        )
        out = module.normalize_file(item)
        self.assertEqual(out['path'], 'conversations.parquet')
        self.assertEqual(out['logical_size'], 1234)
        self.assertEqual(out['git_blob_id'], 'b' * 40)
        self.assertNotIn('sensitive', out)


if __name__ == '__main__':
    unittest.main()
