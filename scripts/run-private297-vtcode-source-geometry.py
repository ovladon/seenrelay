#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import re
from collections import Counter

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.hf_api import RepoFile

REPO = 'vinhnx90/vtcode-sessions'
REVISION = '78049282e2b4fddb2a6d93a0a0e4784a7bd05fc1'
EXPECTED_DATA_EXAMPLES = 100
EXPECTED_DATA_BYTES = 21468595


def family_for_path(path: str) -> str:
    name = pathlib.PurePosixPath(path).name
    if path == 'README.md':
        return 'readme'
    if path == '.gitattributes':
        return 'gitattributes'
    if name.startswith('harness-session-') and name.endswith('.jsonl'):
        return 'harness'
    if name.startswith('atif-trajectory-') and name.endswith('.json'):
        return 'atif'
    if name.startswith('session-') and name.endswith('.json'):
        return 'session_summary'
    if name.endswith('.json') or name.endswith('.jsonl'):
        return 'other_data'
    return 'other'


def source_digest_for_file(item: RepoFile):
    lfs = getattr(item, 'lfs', None)
    if lfs is None:
        return 'git', getattr(item, 'blob_id', None)
    if isinstance(lfs, dict):
        return 'lfs', lfs.get('sha256')
    return 'lfs', getattr(lfs, 'sha256', None)


def stable_manifest(api: HfApi):
    rows = []
    for item in api.list_repo_tree(
        repo_id=REPO,
        repo_type='dataset',
        revision=REVISION,
        recursive=True,
        expand=False,
    ):
        if not isinstance(item, RepoFile):
            continue
        path = getattr(item, 'path', None) or getattr(item, 'rfilename', None)
        size = getattr(item, 'size', None)
        blob_id = getattr(item, 'blob_id', None)
        if not isinstance(path, str) or not isinstance(size, int) or size < 0:
            raise RuntimeError('invalid pinned repository file metadata')
        if not isinstance(blob_id, str) or not re.fullmatch(r'[0-9a-f]{40,64}', blob_id):
            raise RuntimeError('invalid pinned repository blob id')
        digest_kind, digest_value = source_digest_for_file(item)
        if digest_kind == 'lfs' and (not isinstance(digest_value, str) or not re.fullmatch(r'[0-9a-f]{64}', digest_value)):
            raise RuntimeError('invalid pinned LFS sha256')
        rows.append({
            'path': path,
            'size': size,
            'blob_id': blob_id,
            'digest_kind': digest_kind,
            'digest_value': digest_value,
            'family': family_for_path(path),
        })
    rows.sort(key=lambda row: row['path'].encode('utf-8'))
    canonical = ''.join(
        f"{row['path']}\0{row['blob_id']}\0{row['size']}\0{row['digest_kind']}\0{row['digest_value'] or '-'}\n"
        for row in rows
    ).encode('utf-8')
    return rows, hashlib.sha256(canonical).hexdigest()


def verify_file_bytes(path: pathlib.Path, row: dict):
    raw = path.read_bytes()
    if len(raw) != row['size']:
        raise RuntimeError('downloaded file size mismatch')
    if row['digest_kind'] == 'lfs':
        actual = hashlib.sha256(raw).hexdigest()
        if actual != row['digest_value']:
            raise RuntimeError('downloaded LFS sha256 mismatch')
    else:
        header = f"blob {len(raw)}\0".encode('ascii')
        if len(row['blob_id']) == 40:
            actual = hashlib.sha1(header + raw).hexdigest()
        else:
            actual = hashlib.sha256(header + raw).hexdigest()
        if actual != row['blob_id']:
            raise RuntimeError('downloaded Git blob digest mismatch')
    return raw


def first_thread_id_from_harness(raw: bytes):
    try:
        document = json.loads(raw.decode('utf-8', errors='strict'))
    except Exception as exc:
        raise RuntimeError('harness file is not the pinned JSON wrapper format') from exc
    if not isinstance(document, dict):
        raise RuntimeError('harness wrapper is not an object')
    lines = document.get('lines')
    if not isinstance(lines, list) or not lines:
        raise RuntimeError('harness wrapper has no logical lines')
    first = lines[0]
    if not isinstance(first, dict):
        raise RuntimeError('first harness logical event is not an object')
    event = first.get('event')
    if not isinstance(event, dict) or event.get('type') != 'thread.started':
        raise RuntimeError('first harness logical event is not thread.started')
    thread_id = event.get('thread_id')
    if not isinstance(thread_id, str) or not thread_id.strip():
        raise RuntimeError('thread.started has no nonempty thread_id')
    return thread_id


def duplicate_summary(values):
    counts = Counter(values)
    duplicate_groups = sum(1 for count in counts.values() if count > 1)
    extra_occurrences = sum(count - 1 for count in counts.values() if count > 1)
    return len(counts), duplicate_groups, extra_occurrences


def classify(harness_files, valid_harness, unique_threads, duplicate_thread_groups, content_duplicate_groups, readme_ok):
    if (
        readme_ok
        and harness_files >= 2
        and valid_harness == harness_files
        and unique_threads == harness_files
        and duplicate_thread_groups == 0
        and content_duplicate_groups == 0
    ):
        return 'SOURCE_IDENTITY_ADMISSIBLE_FOR_COUNT_ONLY_FOLLOWUP'
    return 'SOURCE_IDENTITY_NOT_ADMISSIBLE'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    work_dir = pathlib.Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    api = HfApi()
    info = api.dataset_info(repo_id=REPO, revision=REVISION)
    if info.sha != REVISION:
        raise RuntimeError('pinned VTCode dataset revision did not resolve exactly')

    rows, manifest_sha256 = stable_manifest(api)
    if not rows:
        raise RuntimeError('pinned VTCode repository tree is empty')

    family_counts = Counter(row['family'] for row in rows)
    family_bytes = Counter()
    for row in rows:
        family_bytes[row['family']] += row['size']

    data_rows = [row for row in rows if row['family'] in {'harness', 'atif', 'session_summary', 'other_data'}]
    data_files = len(data_rows)
    data_bytes = sum(row['size'] for row in data_rows)
    if data_files != EXPECTED_DATA_EXAMPLES or data_bytes != EXPECTED_DATA_BYTES:
        raise RuntimeError(
            f'pinned VTCode data geometry differs from frozen dataset card: files={data_files} bytes={data_bytes}'
        )

    readme_rows = [row for row in rows if row['path'] == 'README.md']
    if len(readme_rows) != 1:
        raise RuntimeError('pinned VTCode README geometry mismatch')
    readme_path = pathlib.Path(hf_hub_download(
        repo_id=REPO,
        repo_type='dataset',
        revision=REVISION,
        filename='README.md',
        local_dir=work_dir / 'hf',
    ))
    readme_raw = verify_file_bytes(readme_path, readme_rows[0])
    readme_text = readme_raw.decode('utf-8', errors='strict')
    readme_lower = readme_text.lower()
    readme_ok = (
        'license: mit' in readme_lower
        and 'sessions are exported from a local vtcode workspace' in readme_lower
        and 'redacted coding agent session traces' in readme_lower
    )
    if not readme_ok:
        raise RuntimeError('pinned VTCode README no longer matches preregistered legal/provenance declarations')

    harness_rows = [row for row in rows if row['family'] == 'harness']
    thread_ids = []
    content_hashes = []
    valid_harness = 0
    invalid_harness = 0

    for row in harness_rows:
        local_path = pathlib.Path(hf_hub_download(
            repo_id=REPO,
            repo_type='dataset',
            revision=REVISION,
            filename=row['path'],
            local_dir=work_dir / 'hf',
        ))
        raw = verify_file_bytes(local_path, row)
        content_hashes.append(hashlib.sha256(raw).hexdigest())
        try:
            thread_id = first_thread_id_from_harness(raw)
        except RuntimeError:
            invalid_harness += 1
            continue
        thread_ids.append(thread_id)
        valid_harness += 1

    if valid_harness + invalid_harness != len(harness_rows):
        raise RuntimeError('harness accounting mismatch')

    unique_threads, duplicate_thread_groups, duplicate_thread_extra_files = duplicate_summary(thread_ids)
    unique_contents, content_duplicate_groups, content_duplicate_extra_files = duplicate_summary(content_hashes)

    decision = classify(
        len(harness_rows),
        valid_harness,
        unique_threads,
        duplicate_thread_groups,
        content_duplicate_groups,
        readme_ok,
    )

    report = {
        'schema': 'seenrelay-private297-vtcode-harness-source-geometry-v1',
        'source': {
            'dataset': REPO,
            'resolved_revision': REVISION,
            'repository_file_count': len(rows),
            'repository_logical_bytes': sum(row['size'] for row in rows),
            'repository_manifest_sha256': manifest_sha256,
            'readme_sha256': hashlib.sha256(readme_raw).hexdigest(),
            'dataset_card_license_mit_confirmed': True,
            'dataset_card_local_workspace_collection_confirmed': True,
            'dataset_card_declared_examples': EXPECTED_DATA_EXAMPLES,
            'dataset_card_declared_bytes': EXPECTED_DATA_BYTES,
        },
        'geometry': {
            'data_files': data_files,
            'data_logical_bytes': data_bytes,
            'family_file_counts': {key: family_counts[key] for key in sorted(family_counts)},
            'family_logical_bytes': {key: family_bytes[key] for key in sorted(family_bytes)},
        },
        'harness_identity': {
            'harness_files': len(harness_rows),
            'valid_harness_wrappers': valid_harness,
            'invalid_harness_wrappers': invalid_harness,
            'nonempty_native_thread_ids': len(thread_ids),
            'unique_native_thread_ids': unique_threads,
            'duplicate_native_thread_id_groups': duplicate_thread_groups,
            'duplicate_native_thread_id_extra_files': duplicate_thread_extra_files,
            'unique_full_file_contents': unique_contents,
            'exact_full_file_content_duplicate_groups': content_duplicate_groups,
            'exact_full_file_content_duplicate_extra_files': content_duplicate_extra_files,
        },
        'decision': {
            'classification': decision,
            'browser_tool_count_authorized': decision == 'SOURCE_IDENTITY_ADMISSIBLE_FOR_COUNT_ONLY_FOLLOWUP',
            'overlap_authorized': False,
        },
        'ingestion': {
            'tool_names_read_or_counted': False,
            'tool_arguments_read_or_counted': False,
            'tool_results_read_or_counted': False,
            'urls_read_or_counted': False,
            'queries_read_or_counted': False,
            'operation_identity_computed': False,
            'overlap_computed': False,
        },
        'privacy': {
            'raw_thread_ids_retained': False,
            'raw_file_paths_retained': False,
            'raw_transcripts_retained': False,
            'raw_tool_data_retained': False,
            'downloaded_external_files_retained': False,
        },
        'interpretation': {
            'private285_class_pass_authorized': False,
            'seenrelay_reuse_authorized': False,
            'production_change_authorized': False,
            'population_prevalence_claim_authorized': False,
            'commercial_claim_authorized': False,
        },
    }

    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'data_files': data_files,
        'harness_files': len(harness_rows),
        'valid_harness_wrappers': valid_harness,
        'invalid_harness_wrappers': invalid_harness,
        'unique_native_thread_ids': unique_threads,
        'duplicate_native_thread_id_groups': duplicate_thread_groups,
        'exact_full_file_content_duplicate_groups': content_duplicate_groups,
        'classification': decision,
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
