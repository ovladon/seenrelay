import importlib.util
import json
import pathlib
import tempfile
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'run-private293-jobseek-screen.py'
spec = importlib.util.spec_from_file_location('private293_jobseek', MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Private293Tests(unittest.TestCase):
    def event(self, session='session-a', uuid='event-a', tool_id='tool-a', url='https://example.com/a', prompt='verify a'):
        return (
            {'sessionId': session, 'uuid': uuid, 'timestamp': '2026-01-01T00:00:00Z'},
            {'type': 'tool_use', 'id': tool_id, 'name': 'WebFetch', 'input': {'url': url, 'prompt': prompt}}
        )

    def test_physical_duplicate_counts_once_and_inconsistent_duplicate_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = mod.ExtractionState(tmp)
            event, block = self.event()
            state.emit_call(event, block)
            state.emit_call(event, block)
            snap = state.snapshot()
            self.assertEqual(snap['webfetch_records_seen_before_physical_dedup'], 2)
            self.assertEqual(snap['duplicate_physical_webfetch_records_removed'], 1)
            self.assertEqual(snap['unique_physical_webfetch_calls'], 1)
            files = list(pathlib.Path(tmp).glob('*.jsonl'))
            self.assertEqual(len(files), 1)
            self.assertEqual(len(files[0].read_text(encoding='utf-8').splitlines()), 1)
            changed = dict(block)
            changed['input'] = {'url': 'https://example.com/a', 'prompt': 'different'}
            with self.assertRaises(RuntimeError):
                state.emit_call(event, changed)

    def test_missing_physical_identity_is_not_emitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = mod.ExtractionState(tmp)
            event, block = self.event(uuid='')
            state.emit_call(event, block)
            snap = state.snapshot()
            self.assertEqual(snap['webfetch_calls_missing_physical_identity'], 1)
            self.assertEqual(snap['unique_physical_webfetch_calls'], 0)
            self.assertEqual(list(pathlib.Path(tmp).glob('*.jsonl')), [])

    def test_phase_a_selection_depends_on_path_not_size_or_company_metadata(self):
        rows_a = [
            {'path': f'traces/company-{i:04d}/2026-01-01.jsonl', 'size': i + 1, 'blob_id': 'a' * 40, 'lfs_sha256': '-'}
            for i in range(mod.LOCKED_FILE_COUNT)
        ]
        rows_b = [dict(row, size=10_000_000 - row['size']) for row in rows_a]
        a1, b1 = mod.selected_phases(rows_a)
        a2, b2 = mod.selected_phases(rows_b)
        self.assertEqual([row['path'] for row in a1], [row['path'] for row in a2])
        self.assertEqual([row['path'] for row in b1], [row['path'] for row in b2])
        self.assertEqual(len(a1), 400)
        self.assertEqual(len(b1), 529)


if __name__ == '__main__':
    unittest.main()
