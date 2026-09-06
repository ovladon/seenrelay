#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
import urllib.parse
import urllib.request

from huggingface_hub import HfApi
from huggingface_hub.hf_api import RepoFile

REPO = 'viktor-shcherb/jobseek-agent-traces'
REVISION = '524f2910f2893b04ccfbb76e56116fe0af3c5bf7'
LOCKED_FILE_COUNT = 929
LOCKED_TOTAL_BYTES = 5700388035
LOCKED_MANIFEST_SHA256 = '113b9ac82efdb8bb6c56171d4dca0671b293cf8eac69667afa6278ca29560af8'
PHASE_A_COUNT = 400
RANK_PREFIX = b'seenrelay-private293-phase-a-v1\0'


def stable_manifest(api):
    rows = []
    total_bytes = 0
    for item in api.list_repo_tree(repo_id=REPO, repo_type='dataset', revision=REVISION, recursive=True, expand=False):
        if not isinstance(item, RepoFile):
            continue
        path = getattr(item, 'path', None) or getattr(item, 'rfilename', None)
        if not isinstance(path, str) or not path.startswith('traces/') or not path.endswith('.jsonl'):
            continue
        size = getattr(item, 'size', None)
        blob_id = getattr(item, 'blob_id', None)
        if not isinstance(size, int) or size <= 0:
            raise RuntimeError('invalid logical size in locked manifest')
        if not isinstance(blob_id, str) or not re.fullmatch(r'[0-9a-f]{40,64}', blob_id):
            raise RuntimeError('invalid blob id in locked manifest')
        lfs = getattr(item, 'lfs', None)
        if lfs is None:
            lfs_sha = '-'
        elif isinstance(lfs, dict):
            lfs_sha = lfs.get('sha256')
        else:
            lfs_sha = getattr(lfs, 'sha256', None)
        if lfs_sha != '-' and (not isinstance(lfs_sha, str) or not re.fullmatch(r'[0-9a-f]{64}', lfs_sha)):
            raise RuntimeError('invalid LFS sha256 in locked manifest')
        rows.append({'path': path, 'blob_id': blob_id, 'size': size, 'lfs_sha256': lfs_sha})
        total_bytes += size
    rows.sort(key=lambda row: row['path'].encode('utf-8'))
    canonical = ''.join(
        f"{row['path']}\0{row['blob_id']}\0{row['size']}\0{row['lfs_sha256']}\n" for row in rows
    ).encode('utf-8')
    digest = hashlib.sha256(canonical).hexdigest()
    if len(rows) != LOCKED_FILE_COUNT or total_bytes != LOCKED_TOTAL_BYTES or digest != LOCKED_MANIFEST_SHA256:
        raise RuntimeError('locked source manifest no longer matches PRIVATE293')
    return rows


def rank_path(path):
    return (hashlib.sha256(RANK_PREFIX + path.encode('utf-8')).digest(), path.encode('utf-8'))


def selected_phases(rows):
    ranked = sorted(rows, key=lambda row: rank_path(row['path']))
    phase_a = ranked[:PHASE_A_COUNT]
    phase_b = ranked[PHASE_A_COUNT:]
    if len(phase_a) != PHASE_A_COUNT or len(phase_b) != LOCKED_FILE_COUNT - PHASE_A_COUNT:
        raise RuntimeError('phase geometry mismatch')
    return phase_a, phase_b


def download_url(path):
    quoted = '/'.join(urllib.parse.quote(part, safe='') for part in path.split('/'))
    return f'https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/{quoted}?download=true'


def iter_verified_lines(row, file_index):
    safe_id = hashlib.sha256(row['path'].encode('utf-8')).hexdigest()[:12]
    last_error = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(download_url(row['path']), headers={'User-Agent': 'seenrelay-private293-screen/1.0'})
            with urllib.request.urlopen(req, timeout=300) as response:
                bytes_read = 0
                if row['lfs_sha256'] != '-':
                    digest = hashlib.sha256()
                elif len(row['blob_id']) == 40:
                    digest = hashlib.sha1()
                    digest.update(f"blob {row['size']}\0".encode('ascii'))
                else:
                    digest = hashlib.sha256()
                    digest.update(f"blob {row['size']}\0".encode('ascii'))
                buffered = []
                for line in response:
                    bytes_read += len(line)
                    digest.update(line)
                    buffered.append(line)
                if bytes_read != row['size']:
                    raise RuntimeError(f'byte count mismatch for file {file_index} id {safe_id}')
                expected = row['lfs_sha256'] if row['lfs_sha256'] != '-' else row['blob_id']
                if digest.hexdigest() != expected:
                    raise RuntimeError(f'content digest mismatch for file {file_index} id {safe_id}')
                for line in buffered:
                    yield line
                return
        except Exception as exc:
            last_error = exc
            if attempt == 3:
                break
            time.sleep(2 ** attempt)
    raise RuntimeError(f'download/integrity failure for file {file_index} id {safe_id}') from last_error


def nonempty_string(value):
    return value if isinstance(value, str) and value.strip() else None


def physical_key(session_id, event_uuid, tool_id):
    raw = session_id.encode('utf-8') + b'\0' + event_uuid.encode('utf-8') + b'\0' + tool_id.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def payload_fingerprint(block):
    payload = {'name': block.get('name'), 'input': block.get('input')}
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


class ExtractionState:
    def __init__(self, session_dir):
        self.session_dir = pathlib.Path(session_dir)
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.physical = {}
        self.sessions_with_webfetch = set()
        self.files_processed = 0
        self.logical_bytes_processed = 0
        self.streamed_bytes = 0
        self.webfetch_records_seen = 0
        self.duplicate_physical_removed = 0
        self.missing_physical_identity = 0
        self.unique_physical_calls = 0

    def snapshot(self):
        return {
            'files_processed': self.files_processed,
            'logical_bytes_processed': self.logical_bytes_processed,
            'streamed_bytes_verified': self.streamed_bytes,
            'native_sessions_with_webfetch': len(self.sessions_with_webfetch),
            'webfetch_records_seen_before_physical_dedup': self.webfetch_records_seen,
            'duplicate_physical_webfetch_records_removed': self.duplicate_physical_removed,
            'webfetch_calls_missing_physical_identity': self.missing_physical_identity,
            'unique_physical_webfetch_calls': self.unique_physical_calls,
            'tool_results_used': False,
            'company_or_issue_identity_used': False,
            'cwd_or_repo_metadata_used': False,
            'free_text_argument_inference_used': False,
            'raw_values_retained_in_report': False,
        }

    def emit_call(self, event, block):
        self.webfetch_records_seen += 1
        session_id = nonempty_string(event.get('sessionId'))
        event_uuid = nonempty_string(event.get('uuid'))
        tool_id = nonempty_string(block.get('id'))
        if not session_id or not event_uuid or not tool_id:
            self.missing_physical_identity += 1
            return
        key = physical_key(session_id, event_uuid, tool_id)
        fingerprint = payload_fingerprint(block)
        prior = self.physical.get(key)
        if prior is not None:
            if prior != fingerprint:
                raise RuntimeError('same physical WebFetch identity has inconsistent payload')
            self.duplicate_physical_removed += 1
            return
        self.physical[key] = fingerprint
        self.unique_physical_calls += 1
        session_hash = hashlib.sha256(session_id.encode('utf-8')).hexdigest()
        self.sessions_with_webfetch.add(session_hash)
        out_event = {
            'type': 'assistant',
            'timestamp': event.get('timestamp') if isinstance(event.get('timestamp'), str) else None,
            'message': {
                'role': 'assistant',
                'content': [{
                    'type': 'tool_use',
                    'name': 'WebFetch',
                    'input': block.get('input') if isinstance(block.get('input'), dict) else {}
                }]
            }
        }
        target = self.session_dir / f'{session_hash}.jsonl'
        with target.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(out_event, ensure_ascii=False, separators=(',', ':')) + '\n')


def process_trace(row, state, file_index):
    first_record_seen = False
    header_seen = False
    for raw_line in iter_verified_lines(row, file_index):
        state.streamed_bytes += len(raw_line)
        if not raw_line.strip():
            continue
        try:
            event = json.loads(raw_line.decode('utf-8', errors='strict'))
        except Exception as exc:
            raise RuntimeError(f'invalid JSON/UTF-8 in locked trace file index {file_index}') from exc
        if not first_record_seen:
            first_record_seen = True
            if not isinstance(event, dict) or event.get('_trace_header') is not True:
                raise RuntimeError(f'missing publisher trace header at file index {file_index}')
            header_seen = True
            continue
        if not isinstance(event, dict):
            raise RuntimeError(f'non-object trace record at file index {file_index}')
        if event.get('type') != 'assistant':
            continue
        message = event.get('message')
        if not isinstance(message, dict):
            raise RuntimeError(f'assistant record missing message object at file index {file_index}')
        content = message.get('content')
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict) or block.get('type') != 'tool_use' or block.get('name') != 'WebFetch':
                continue
            state.emit_call(event, block)
    if not first_record_seen or not header_seen:
        raise RuntimeError(f'empty or malformed locked trace file index {file_index}')
    state.files_processed += 1
    state.logical_bytes_processed += row['size']


def process_phase(rows, state, phase_name):
    for index, row in enumerate(rows, 1):
        process_trace(row, state, index)
        if index % 25 == 0 or index == len(rows):
            print(json.dumps({'phase': phase_name, 'files_completed': index, 'files_total': len(rows)}))


def run_node_screen(session_dir, output_path):
    subprocess.run([
        'node', 'scripts/screen-browser-trace-overlap.mjs',
        '--input-dir', str(session_dir),
        '--source-revision', REVISION,
        '--source-dataset', f'{REPO}/locked-private293',
        '--output', str(output_path),
    ], check=True)
    return json.loads(pathlib.Path(output_path).read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    work = pathlib.Path(args.work_dir)
    if work.exists():
        shutil.rmtree(work)
    session_dir = work / 'sessions'
    session_dir.mkdir(parents=True)

    # Metadata-only reconstruction and deterministic selection occur before any trace payload is opened.
    rows = stable_manifest(HfApi())
    phase_a, phase_b = selected_phases(rows)
    phase_a_bytes = sum(row['size'] for row in phase_a)
    phase_b_bytes = sum(row['size'] for row in phase_b)

    state = ExtractionState(session_dir)
    process_phase(phase_a, state, 'A')
    phase_a_snapshot = state.snapshot()
    phase_a_core_path = work / 'phase-a-core.json'
    phase_a_core = run_node_screen(session_dir, phase_a_core_path)
    if phase_a_core['webfetch_calls_seen'] != phase_a_snapshot['unique_physical_webfetch_calls']:
        raise RuntimeError('phase A physical-call/core geometry mismatch')

    phase_b_triggered = phase_a_core['eligible_http_webfetch_calls'] < 100
    if phase_b_triggered:
        process_phase(phase_b, state, 'B')
        final_core_path = work / 'final-core.json'
        final_core = run_node_screen(session_dir, final_core_path)
        phase_used = 'A+B_FULL_CORPUS'
    else:
        final_core = phase_a_core
        phase_used = 'A_ONLY_FLOOR_MET'

    final_snapshot = state.snapshot()
    if final_core['webfetch_calls_seen'] != final_snapshot['unique_physical_webfetch_calls']:
        raise RuntimeError('final physical-call/core geometry mismatch')
    if phase_b_triggered and final_snapshot['files_processed'] != LOCKED_FILE_COUNT:
        raise RuntimeError('phase B triggered but full locked corpus was not processed')
    if not phase_b_triggered and final_snapshot['files_processed'] != PHASE_A_COUNT:
        raise RuntimeError('phase B forbidden but phase A geometry changed')
    if (not phase_b_triggered) and final_core['eligible_http_webfetch_calls'] < 100:
        raise RuntimeError('phase B was incorrectly skipped below sample floor')

    report = {
        'schema': 'seenrelay-private293-jobseek-natural-browser-overlap-v1',
        'source': {
            'dataset': REPO,
            'resolved_revision': REVISION,
            'license': 'MIT',
            'locked_trace_files': LOCKED_FILE_COUNT,
            'locked_trace_total_bytes': LOCKED_TOTAL_BYTES,
            'trace_manifest_sha256': LOCKED_MANIFEST_SHA256,
        },
        'selection': {
            'phase_a_file_count': PHASE_A_COUNT,
            'phase_a_rank': "ascending sha256('seenrelay-private293-phase-a-v1\\0' + UTF8(path)); ties by raw UTF-8 path",
            'phase_a_logical_bytes': phase_a_bytes,
            'phase_a_completed': True,
            'phase_a_eligible_http_webfetch_calls': phase_a_core['eligible_http_webfetch_calls'],
            'phase_b_triggered': phase_b_triggered,
            'phase_b_file_count_if_triggered': len(phase_b),
            'phase_b_logical_bytes_if_triggered': phase_b_bytes,
            'phase_used': phase_used,
            'final_files_processed': final_snapshot['files_processed'],
            'selection_used_file_size': False,
            'selection_used_company_or_issue_metadata': False,
            'selection_used_trace_content': False,
            'early_stop_within_phase': False,
        },
        'extraction': final_snapshot,
        'overlap': final_core,
        'interpretation': {
            'auxiliary_natural_screen_only': True,
            'authoritative_browser_replay_performed': False,
            'private285_class_pass_authorized': False,
            'population_prevalence_claim_authorized': False,
            'cross_native_session_is_independence_proxy_only': True,
            'observer_independence_proven': False,
        },
        'privacy': {
            'raw_trace_files_retained': False,
            'transient_session_extracts_retained': False,
            'raw_urls_retained': False,
            'raw_prompts_retained': False,
            'raw_results_retained': False,
            'company_names_retained': False,
            'company_slugs_retained': False,
            'issue_numbers_retained': False,
            'native_session_ids_retained': False,
            'assistant_uuids_retained': False,
            'tool_use_ids_retained': False,
            'physical_call_keys_retained': False,
            'per_operation_key_hashes_retained': False,
        }
    }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'phase_used': phase_used,
        'files_processed': final_snapshot['files_processed'],
        'eligible_http_webfetch_calls': final_core['eligible_http_webfetch_calls'],
        'cross_session_exact_reuse_percent': final_core['cross_session_exact_reuse_percent'],
        'classification': final_core['classification'],
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
