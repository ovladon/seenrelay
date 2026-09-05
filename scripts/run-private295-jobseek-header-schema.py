#!/usr/bin/env python3
import argparse
import importlib.util
import json
import pathlib
import time
import urllib.request
from collections import Counter, defaultdict

PARENT_PATH = pathlib.Path(__file__).resolve().parent / 'run-private293-jobseek-screen.py'
spec = importlib.util.spec_from_file_location('private293_jobseek_frozen', PARENT_PATH)
parent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parent)

EXPECTED_FILES = 400
ALLOWED_TYPES = ('null', 'boolean', 'number', 'string', 'array', 'object')


def json_type(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return 'number'
    if isinstance(value, str):
        return 'string'
    if isinstance(value, list):
        return 'array'
    if isinstance(value, dict):
        return 'object'
    raise TypeError('unsupported JSON value type')


def inventory_header(header, presence, type_counts):
    if not isinstance(header, dict) or header.get('_trace_header') is not True:
        raise RuntimeError('invalid publisher trace header')
    for key, value in header.items():
        if not isinstance(key, str):
            raise RuntimeError('non-string JSON object key')
        presence[key] += 1
        type_counts[key][json_type(value)] += 1


def read_first_nonempty_record(row, file_index):
    last_error = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                parent.download_url(row['path']),
                headers={'User-Agent': 'seenrelay-private295-header-schema/1.0'},
            )
            with urllib.request.urlopen(req, timeout=300) as response:
                for raw_line in response:
                    if not raw_line.strip():
                        continue
                    try:
                        return json.loads(raw_line.decode('utf-8', errors='strict'))
                    except Exception as exc:
                        raise RuntimeError(f'invalid first JSON/UTF-8 record at file index {file_index}') from exc
                raise RuntimeError(f'empty locked trace file index {file_index}')
        except Exception as exc:
            last_error = exc
            if attempt == 3:
                break
            time.sleep(2 ** attempt)
    raise RuntimeError(f'header read failure at file index {file_index}') from last_error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    rows = parent.stable_manifest(parent.HfApi())
    phase_a, _ = parent.selected_phases(rows)
    if len(phase_a) != EXPECTED_FILES:
        raise RuntimeError('PRIVATE295 phase A geometry mismatch')

    presence = Counter()
    type_counts = defaultdict(Counter)
    valid_headers = 0

    for file_index, row in enumerate(phase_a, 1):
        header = read_first_nonempty_record(row, file_index)
        inventory_header(header, presence, type_counts)
        valid_headers += 1

    if valid_headers != EXPECTED_FILES:
        raise RuntimeError('PRIVATE295 did not process all selected headers')
    if presence.get('_trace_header') != EXPECTED_FILES:
        raise RuntimeError('PRIVATE295 publisher header marker geometry mismatch')
    if type_counts['_trace_header'].get('boolean') != EXPECTED_FILES:
        raise RuntimeError('PRIVATE295 publisher header marker type mismatch')

    inventory = {}
    for key in sorted(presence, key=lambda value: value.encode('utf-8')):
        inventory[key] = {
            'presence_count': presence[key],
            'json_type_counts': {
                type_name: type_counts[key].get(type_name, 0)
                for type_name in ALLOWED_TYPES
                if type_counts[key].get(type_name, 0) > 0
            },
        }

    report = {
        'schema': 'seenrelay-private295-jobseek-header-schema-v1',
        'parent_results': {
            'private293_research_head': '1ae9ab3b0ec2193ffccdca78d32744a3aa6f516d',
            'private293_workflow_run_id': 33992072773,
            'private294_research_head': '64ee0e39e0b0e608d28f0318f4805899b7b6849e',
            'private294_workflow_run_id': 33992893536,
            'private293_frozen': True,
            'private294_frozen': True,
        },
        'source': {
            'dataset': parent.REPO,
            'resolved_revision': parent.REVISION,
            'trace_manifest_sha256': parent.LOCKED_MANIFEST_SHA256,
        },
        'selection': {
            'phase': 'PRIVATE293_PHASE_A_EXACT_REUSE',
            'selected_files': EXPECTED_FILES,
            'valid_headers': valid_headers,
            'phase_b_used': False,
            'selection_used_header_content': False,
            'selection_used_file_size': False,
            'selection_used_company_or_issue_metadata': False,
        },
        'ingestion': {
            'only_first_nonempty_record_read': True,
            'transcript_records_read': False,
            'urls_read': False,
            'prompts_read': False,
            'tool_results_read': False,
            'header_values_compared': False,
            'session_identity_constructed': False,
            'overlap_computed': False,
        },
        'header_schema': {
            'distinct_top_level_key_count': len(inventory),
            'keys': inventory,
        },
        'decision': {
            'schema_inventory_only': True,
            'header_field_authorized_as_session_identity': False,
            'value_level_followup_requires_new_preregistration': True,
        },
        'privacy': {
            'raw_header_values_retained': False,
            'raw_trace_files_retained': False,
            'file_paths_retained': False,
            'session_identity_values_retained': False,
            'company_or_issue_metadata_retained': False,
        },
        'interpretation': {
            'reuse_evidence': False,
            'population_prevalence_evidence': False,
            'private285_class_pass_authorized': False,
            'private293_reclassification_authorized': False,
            'private294_reclassification_authorized': False,
        },
    }

    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'valid_headers': valid_headers,
        'distinct_top_level_key_count': len(inventory),
        'header_keys': sorted(inventory),
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
