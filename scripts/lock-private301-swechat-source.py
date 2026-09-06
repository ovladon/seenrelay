#!/usr/bin/env python3
import argparse
import json
import pathlib
import re

from huggingface_hub import HfApi
from huggingface_hub.hf_api import RepoFile

REPO = 'SALT-NLP/SWE-chat'
REQUESTED_REVISION = 'main'
TARGETS = ('README.md', 'conversations.parquet', 'sessions.parquet', 'session_logs.parquet')


def card_license(card_data):
    if card_data is None:
        return None
    if hasattr(card_data, 'to_dict'):
        card_data = card_data.to_dict()
    if isinstance(card_data, dict):
        value = card_data.get('license')
        return value if isinstance(value, str) else None
    value = getattr(card_data, 'license', None)
    return value if isinstance(value, str) else None


def normalize_lfs(value):
    if value is None:
        return None
    if hasattr(value, 'to_dict'):
        value = value.to_dict()
    if not isinstance(value, dict):
        value = {
            'sha256': getattr(value, 'sha256', None),
            'size': getattr(value, 'size', None),
            'pointer_size': getattr(value, 'pointer_size', None),
        }
    allowed = {}
    for key in ('sha256', 'size', 'pointer_size'):
        item = value.get(key)
        if item is not None:
            allowed[key] = item
    return allowed or None


def normalize_file(item):
    path = getattr(item, 'path', None) or getattr(item, 'rfilename', None)
    size = getattr(item, 'size', None)
    blob_id = getattr(item, 'blob_id', None)
    if not isinstance(path, str) or path not in TARGETS:
        raise RuntimeError('unexpected target file')
    if not isinstance(size, int) or size <= 0:
        raise RuntimeError(f'invalid logical size for {path}')
    if not isinstance(blob_id, str) or not re.fullmatch(r'[0-9a-f]{40,64}', blob_id):
        raise RuntimeError(f'invalid blob id for {path}')
    out = {
        'path': path,
        'logical_size': size,
        'git_blob_id': blob_id,
        'lfs': normalize_lfs(getattr(item, 'lfs', None)),
    }
    xet_hash = getattr(item, 'xet_hash', None)
    if isinstance(xet_hash, str) and xet_hash:
        out['xet_hash'] = xet_hash
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    api = HfApi()
    info = api.dataset_info(repo_id=REPO, revision=REQUESTED_REVISION)
    resolved = getattr(info, 'sha', None)
    if not isinstance(resolved, str) or not re.fullmatch(r'[0-9a-f]{40,64}', resolved):
        raise RuntimeError('Hub did not return a valid resolved revision')

    found = {}
    for item in api.list_repo_tree(
        repo_id=REPO,
        repo_type='dataset',
        revision=resolved,
        recursive=False,
        expand=False,
    ):
        if not isinstance(item, RepoFile):
            continue
        path = getattr(item, 'path', None) or getattr(item, 'rfilename', None)
        if path in TARGETS:
            found[path] = normalize_file(item)

    if set(found) != set(TARGETS):
        raise RuntimeError(f'missing required source metadata: {sorted(set(TARGETS) - set(found))}')

    license_name = card_license(getattr(info, 'card_data', None))
    gated = getattr(info, 'gated', None)
    report = {
        'schema': 'seenrelay-private301-swechat-full-source-lock-v1',
        'source': {
            'dataset': REPO,
            'requested_revision': REQUESTED_REVISION,
            'resolved_revision': resolved,
            'license': license_name,
            'gated': gated,
        },
        'files': {name: found[name] for name in TARGETS},
        'access': {
            'metadata_only': True,
            'file_content_downloaded': False,
            'readme_content_downloaded': False,
            'parquet_content_downloaded': False,
            'transcript_content_downloaded': False,
        },
        'analysis': {
            'webfetch_rows_read': False,
            'webfetch_count_computed': False,
            'tool_input_json_read': False,
            'operation_identity_constructed': False,
            'overlap_computed': False,
        },
    }
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'resolved_revision': resolved,
        'license': license_name,
        'gated': gated,
        'files': {name: {'logical_size': found[name]['logical_size'], 'git_blob_id': found[name]['git_blob_id']} for name in TARGETS},
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
