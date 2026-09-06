#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import re
from collections import Counter

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.hf_api import RepoFile

REPO = 'RangaPrasath/coding-sessions'
REVISION_PREFIX = 'e37635a'
EXPECTED_SESSIONS = 73
EXPECTED_SOURCE = 'codex'
ID_RE = re.compile(r'^[0-9a-f]{16}$')


def source_digest_for_file(item: RepoFile):
    lfs = getattr(item, 'lfs', None)
    if lfs is None:
        return 'git', getattr(item, 'blob_id', None)
    if isinstance(lfs, dict):
        return 'lfs', lfs.get('sha256')
    return 'lfs', getattr(lfs, 'sha256', None)


def stable_manifest(api: HfApi, revision: str):
    rows = []
    for item in api.list_repo_tree(
        repo_id=REPO,
        repo_type='dataset',
        revision=revision,
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
        if digest_kind == 'lfs' and (
            not isinstance(digest_value, str) or not re.fullmatch(r'[0-9a-f]{64}', digest_value)
        ):
            raise RuntimeError('invalid pinned LFS sha256')
        rows.append({
            'path': path,
            'size': size,
            'blob_id': blob_id,
            'digest_kind': digest_kind,
            'digest_value': digest_value,
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


def is_session_row(obj):
    return (
        isinstance(obj, dict)
        and isinstance(obj.get('id'), str)
        and bool(obj['id'].strip())
        and isinstance(obj.get('source'), str)
        and bool(obj['source'].strip())
        and isinstance(obj.get('messages'), list)
    )


def duplicate_summary(values):
    counts = Counter(values)
    groups = sum(1 for count in counts.values() if count > 1)
    extras = sum(count - 1 for count in counts.values() if count > 1)
    return len(counts), groups, extras


def classify(session_count, codex_count, pattern_count, unique_ids, duplicate_id_groups, duplicate_row_groups, card_ok):
    if (
        card_ok
        and session_count == EXPECTED_SESSIONS
        and codex_count == EXPECTED_SESSIONS
        and pattern_count == EXPECTED_SESSIONS
        and unique_ids == EXPECTED_SESSIONS
        and duplicate_id_groups == 0
        and duplicate_row_groups == 0
    ):
        return 'SOURCE_IDENTITY_ADMISSIBLE_FOR_TOOL_COUNT_FOLLOWUP'
    return 'SOURCE_IDENTITY_NOT_ADMISSIBLE'


def card_license(info):
    card_data = getattr(info, 'card_data', None)
    if isinstance(card_data, dict):
        return card_data.get('license')
    return getattr(card_data, 'license', None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    work_dir = pathlib.Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    api = HfApi()
    info = api.dataset_info(repo_id=REPO, revision=REVISION_PREFIX)
    resolved = info.sha
    if not isinstance(resolved, str) or not re.fullmatch(r'[0-9a-f]{40}', resolved):
        raise RuntimeError('historical revision did not resolve to an exact commit')
    if not resolved.startswith(REVISION_PREFIX):
        raise RuntimeError('historical revision resolved outside frozen prefix')

    rows, manifest_sha256 = stable_manifest(api, resolved)
    if not rows:
        raise RuntimeError('pinned Codex dataset repository tree is empty')

    by_path = {row['path']: row for row in rows}
    if 'README.md' not in by_path or 'sessions.jsonl' not in by_path:
        raise RuntimeError('pinned Codex dataset is missing required files')

    readme_path = pathlib.Path(hf_hub_download(
        repo_id=REPO,
        repo_type='dataset',
        revision=resolved,
        filename='README.md',
        local_dir=work_dir / 'hf',
    ))
    readme_raw = verify_file_bytes(readme_path, by_path['README.md'])
    readme_lower = readme_raw.decode('utf-8', errors='strict').lower()
    required_fragments = [
        '73 real coding sessions',
        'openai codex',
        'pi-brain',
        'v0.1.0',
        '~/.codex/sessions/',
        '73 sessions',
        'full trajectories',
    ]
    license_value = card_license(info)
    license_ok = isinstance(license_value, str) and license_value.lower() == 'mit'
    readme_ok = all(fragment in readme_lower for fragment in required_fragments)
    card_ok = license_ok and readme_ok
    if not card_ok:
        raise RuntimeError('historical dataset card does not match frozen Codex-only MIT declarations')

    sessions_path = pathlib.Path(hf_hub_download(
        repo_id=REPO,
        repo_type='dataset',
        revision=resolved,
        filename='sessions.jsonl',
        local_dir=work_dir / 'hf',
    ))
    raw_sessions = verify_file_bytes(sessions_path, by_path['sessions.jsonl'])

    ids = []
    row_hashes = []
    session_count = 0
    codex_count = 0
    id_pattern_count = 0
    non_session_rows = 0
    invalid_json_lines = 0

    for raw_line in raw_sessions.splitlines():
        if not raw_line.strip():
            continue
        try:
            obj = json.loads(raw_line.decode('utf-8', errors='strict'))
        except Exception:
            invalid_json_lines += 1
            continue
        if not is_session_row(obj):
            non_session_rows += 1
            continue
        session_count += 1
        session_id = obj['id'].strip()
        ids.append(session_id)
        if obj['source'].strip() == EXPECTED_SOURCE:
            codex_count += 1
        if ID_RE.fullmatch(session_id):
            id_pattern_count += 1
        row_hashes.append(hashlib.sha256(raw_line).hexdigest())

    unique_ids, duplicate_id_groups, duplicate_id_extra_rows = duplicate_summary(ids)
    unique_rows, duplicate_row_groups, duplicate_row_extra_rows = duplicate_summary(row_hashes)

    decision = classify(
        session_count,
        codex_count,
        id_pattern_count,
        unique_ids,
        duplicate_id_groups,
        duplicate_row_groups,
        card_ok,
    )

    report = {
        'schema': 'seenrelay-private298-codex-source-identity-v1',
        'source': {
            'dataset': REPO,
            'frozen_revision_prefix': REVISION_PREFIX,
            'resolved_revision': resolved,
            'repository_file_count': len(rows),
            'repository_logical_bytes': sum(row['size'] for row in rows),
            'repository_manifest_sha256': manifest_sha256,
            'readme_sha256': hashlib.sha256(readme_raw).hexdigest(),
            'sessions_jsonl_sha256': hashlib.sha256(raw_sessions).hexdigest(),
            'sessions_jsonl_logical_bytes': len(raw_sessions),
            'dataset_card_license_mit_confirmed': license_ok,
            'dataset_card_codex_only_declarations_confirmed': readme_ok,
            'dataset_card_mit_codex_only_declarations_confirmed': card_ok,
        },
        'identity': {
            'session_rows': session_count,
            'non_session_rows': non_session_rows,
            'invalid_json_lines': invalid_json_lines,
            'codex_source_rows': codex_count,
            'anonymized_id_pattern_rows': id_pattern_count,
            'unique_anonymized_session_ids': unique_ids,
            'duplicate_anonymized_session_id_groups': duplicate_id_groups,
            'duplicate_anonymized_session_id_extra_rows': duplicate_id_extra_rows,
            'unique_full_session_rows': unique_rows,
            'exact_full_session_row_duplicate_groups': duplicate_row_groups,
            'exact_full_session_row_duplicate_extra_rows': duplicate_row_extra_rows,
        },
        'decision': {
            'classification': decision,
            'tool_count_followup_authorized': decision == 'SOURCE_IDENTITY_ADMISSIBLE_FOR_TOOL_COUNT_FOLLOWUP',
            'overlap_authorized': False,
        },
        'ingestion': {
            'message_contents_accessed': False,
            'tools_array_contents_accessed': False,
            'tool_call_names_accessed': False,
            'tool_call_arguments_accessed': False,
            'tool_results_accessed': False,
            'urls_or_queries_accessed': False,
            'operation_identity_computed': False,
            'overlap_computed': False,
        },
        'privacy': {
            'raw_session_ids_retained': False,
            'raw_session_rows_retained': False,
            'raw_messages_retained': False,
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
        'resolved_revision': resolved,
        'session_rows': session_count,
        'codex_source_rows': codex_count,
        'unique_anonymized_session_ids': unique_ids,
        'duplicate_anonymized_session_id_groups': duplicate_id_groups,
        'exact_full_session_row_duplicate_groups': duplicate_row_groups,
        'classification': decision,
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
