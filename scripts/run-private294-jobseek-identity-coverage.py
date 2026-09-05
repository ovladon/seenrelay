#!/usr/bin/env python3
import argparse
import importlib.util
import json
import pathlib
from collections import Counter

PARENT_PATH = pathlib.Path(__file__).resolve().parent / 'run-private293-jobseek-screen.py'
spec = importlib.util.spec_from_file_location('private293_jobseek_frozen', PARENT_PATH)
parent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parent)

EXPECTED_FILES = 400
EXPECTED_LOGICAL_BYTES = 2828013200
EXPECTED_WEBFETCH_RECORDS = 9603
EXPECTED_ALL_THREE = 773
EXPECTED_MISSING_ANY = 8830
DOMINANT_PERCENT = 95


def presence_mask(session_id, event_uuid, tool_id):
    return ''.join('1' if parent.nonempty_string(value) else '0' for value in (session_id, event_uuid, tool_id))


def classify_missing(mask_counts, missing_any):
    if missing_any <= 0:
        return 'NO_MISSING_IDENTITY_RECORDS'
    threshold = missing_any * DOMINANT_PERCENT
    if mask_counts.get('011', 0) * 100 >= threshold:
        return 'SESSION_ID_ONLY_DOMINANT_GAP'
    if mask_counts.get('101', 0) * 100 >= threshold:
        return 'ASSISTANT_UUID_ONLY_DOMINANT_GAP'
    if mask_counts.get('110', 0) * 100 >= threshold:
        return 'TOOL_USE_ID_ONLY_DOMINANT_GAP'
    return 'MIXED_IDENTITY_GAPS'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    rows = parent.stable_manifest(parent.HfApi())
    phase_a, _ = parent.selected_phases(rows)
    if len(phase_a) != EXPECTED_FILES:
        raise RuntimeError('PRIVATE294 phase A geometry mismatch')

    masks = Counter({f'{a}{b}{c}': 0 for a in '01' for b in '01' for c in '01'})
    files_processed = 0
    logical_bytes = 0
    webfetch_records = 0

    for file_index, row in enumerate(phase_a, 1):
        first_record_seen = False
        for raw_line in parent.iter_verified_lines(row, file_index):
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
                continue

            if not isinstance(event, dict) or event.get('type') != 'assistant':
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
                webfetch_records += 1
                mask = presence_mask(event.get('sessionId'), event.get('uuid'), block.get('id'))
                masks[mask] += 1

        if not first_record_seen:
            raise RuntimeError(f'empty locked trace file index {file_index}')
        files_processed += 1
        logical_bytes += row['size']

    all_three = masks['111']
    missing_any = webfetch_records - all_three
    if files_processed != EXPECTED_FILES or logical_bytes != EXPECTED_LOGICAL_BYTES:
        raise RuntimeError('PRIVATE294 selected source geometry does not match PRIVATE293 Phase A')
    if webfetch_records != EXPECTED_WEBFETCH_RECORDS:
        raise RuntimeError('PRIVATE294 WebFetch record count does not match PRIVATE293')
    if all_three != EXPECTED_ALL_THREE:
        raise RuntimeError('PRIVATE294 all-three-present count does not match PRIVATE293')
    if missing_any != EXPECTED_MISSING_ANY:
        raise RuntimeError('PRIVATE294 missing-any count does not match PRIVATE293')
    if sum(masks.values()) != webfetch_records:
        raise RuntimeError('PRIVATE294 presence bitmask counts do not sum to WebFetch records')

    session_present = sum(count for mask, count in masks.items() if mask[0] == '1')
    uuid_present = sum(count for mask, count in masks.items() if mask[1] == '1')
    tool_present = sum(count for mask, count in masks.items() if mask[2] == '1')
    diagnosis = classify_missing(masks, missing_any)

    report = {
        'schema': 'seenrelay-private294-jobseek-physical-identity-coverage-v1',
        'parent_private293': {
            'research_head': '1ae9ab3b0ec2193ffccdca78d32744a3aa6f516d',
            'workflow_run_id': 33992072773,
            'artifact_id': 9977093099,
            'result_frozen': True,
            'reclassified': False,
        },
        'source': {
            'dataset': parent.REPO,
            'resolved_revision': parent.REVISION,
            'trace_manifest_sha256': parent.LOCKED_MANIFEST_SHA256,
        },
        'selection': {
            'phase': 'PRIVATE293_PHASE_A_EXACT_REUSE',
            'files_processed': files_processed,
            'logical_bytes_verified': logical_bytes,
            'phase_b_used': False,
            'selection_used_trace_content': False,
            'selection_used_file_size': False,
            'selection_used_company_or_issue_metadata': False,
        },
        'coverage': {
            'webfetch_records_seen': webfetch_records,
            'sessionId_present': session_present,
            'assistant_uuid_present': uuid_present,
            'tool_use_id_present': tool_present,
            'missing_sessionId': webfetch_records - session_present,
            'missing_assistant_uuid': webfetch_records - uuid_present,
            'missing_tool_use_id': webfetch_records - tool_present,
            'all_three_present': all_three,
            'missing_at_least_one': missing_any,
            'presence_mask_order': 'sessionId,assistant_uuid,tool_use_id',
            'presence_bitmask_counts': {key: masks[key] for key in sorted(masks)},
        },
        'decision': {
            'single_field_dominant_threshold_percent_of_missing_records': DOMINANT_PERCENT,
            'diagnosis': diagnosis,
            'overlap_rerun_authorized': False,
            'private293_reinterpretation_authorized': False,
        },
        'interpretation': {
            'aggregate_schema_coverage_diagnostic_only': True,
            'operation_identity_constructed': False,
            'overlap_computed': False,
            'reuse_evidence': False,
            'population_prevalence_evidence': False,
            'private285_class_pass_authorized': False,
        },
        'privacy': {
            'raw_trace_files_retained': False,
            'raw_values_retained': False,
            'file_paths_retained': False,
            'session_ids_retained': False,
            'assistant_uuids_retained': False,
            'tool_use_ids_retained': False,
            'urls_read': False,
            'prompts_read': False,
            'tool_results_read': False,
            'company_or_issue_metadata_retained': False,
        },
    }

    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'webfetch_records_seen': webfetch_records,
        'all_three_present': all_three,
        'missing_at_least_one': missing_any,
        'presence_bitmask_counts': report['coverage']['presence_bitmask_counts'],
        'diagnosis': diagnosis,
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
