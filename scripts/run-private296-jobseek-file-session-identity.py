#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib
from collections import Counter, defaultdict

PARENT_PATH = pathlib.Path(__file__).resolve().parent / 'run-private293-jobseek-screen.py'
spec = importlib.util.spec_from_file_location('private293_jobseek_frozen', PARENT_PATH)
parent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parent)

EXPECTED_FILES = 400
EXPECTED_LOGICAL_BYTES = 2828013200
EXPECTED_WEBFETCH_RECORDS = 9603


def event_pair_hash(event_uuid, tool_id):
    raw = event_uuid.encode('utf-8') + b'\0' + tool_id.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def candidate_physical_hash(file_index, pair_hash):
    raw = str(file_index).encode('ascii') + b'\0' + pair_hash.encode('ascii')
    return hashlib.sha256(raw).hexdigest()


def classify(
    files_processed,
    webfetch_records,
    missing_uuid,
    missing_tool_id,
    duplicate_candidate_records,
    cross_file_pair_keys,
    duplicate_content_groups,
):
    supported = (
        files_processed == EXPECTED_FILES
        and webfetch_records == EXPECTED_WEBFETCH_RECORDS
        and missing_uuid == 0
        and missing_tool_id == 0
        and duplicate_candidate_records == 0
        and cross_file_pair_keys == 0
        and duplicate_content_groups == 0
    )
    return (
        'FILE_SESSION_BOUNDARY_SUPPORTED_FOR_SEPARATE_OVERLAP_STUDY'
        if supported
        else 'FILE_SESSION_BOUNDARY_NOT_DUPLICATE_SAFE'
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    rows = parent.stable_manifest(parent.HfApi())
    phase_a, _ = parent.selected_phases(rows)
    if len(phase_a) != EXPECTED_FILES:
        raise RuntimeError('PRIVATE296 phase A geometry mismatch')

    files_processed = 0
    logical_bytes = 0
    webfetch_records = 0
    files_with_webfetch = 0
    missing_uuid = 0
    missing_tool_id = 0
    missing_either = 0

    candidate_keys = set()
    duplicate_candidate_records = 0
    pair_files = defaultdict(set)
    pair_record_counts = Counter()
    content_hash_counts = Counter()

    for file_index, row in enumerate(phase_a, 1):
        first_record_seen = False
        has_webfetch = False
        file_digest = hashlib.sha256()

        for raw_line in parent.iter_verified_lines(row, file_index):
            file_digest.update(raw_line)
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
                has_webfetch = True
                webfetch_records += 1

                event_uuid = parent.nonempty_string(event.get('uuid'))
                tool_id = parent.nonempty_string(block.get('id'))
                if not event_uuid:
                    missing_uuid += 1
                if not tool_id:
                    missing_tool_id += 1
                if not event_uuid or not tool_id:
                    missing_either += 1
                    continue

                pair_hash = event_pair_hash(event_uuid, tool_id)
                pair_files[pair_hash].add(file_index)
                pair_record_counts[pair_hash] += 1

                physical = candidate_physical_hash(file_index, pair_hash)
                if physical in candidate_keys:
                    duplicate_candidate_records += 1
                else:
                    candidate_keys.add(physical)

        if not first_record_seen:
            raise RuntimeError(f'empty locked trace file index {file_index}')

        content_hash_counts[file_digest.hexdigest()] += 1
        if has_webfetch:
            files_with_webfetch += 1
        files_processed += 1
        logical_bytes += row['size']

    if files_processed != EXPECTED_FILES or logical_bytes != EXPECTED_LOGICAL_BYTES:
        raise RuntimeError('PRIVATE296 selected source geometry does not match PRIVATE293 Phase A')
    if webfetch_records != EXPECTED_WEBFETCH_RECORDS:
        raise RuntimeError('PRIVATE296 WebFetch geometry does not match PRIVATE294')
    if missing_uuid != 0 or missing_tool_id != 0 or missing_either != 0:
        raise RuntimeError('PRIVATE296 event-ID coverage does not match PRIVATE294')

    cross_file_pair_keys = 0
    cross_file_pair_extra_records = 0
    cross_file_pair_files = set()
    for pair_hash, file_ids in pair_files.items():
        if len(file_ids) <= 1:
            continue
        cross_file_pair_keys += 1
        cross_file_pair_extra_records += pair_record_counts[pair_hash] - 1
        cross_file_pair_files.update(file_ids)

    duplicate_content_groups = sum(1 for count in content_hash_counts.values() if count > 1)
    duplicate_content_extra_files = sum(count - 1 for count in content_hash_counts.values() if count > 1)

    verdict = classify(
        files_processed,
        webfetch_records,
        missing_uuid,
        missing_tool_id,
        duplicate_candidate_records,
        cross_file_pair_keys,
        duplicate_content_groups,
    )

    report = {
        'schema': 'seenrelay-private296-jobseek-file-session-identity-v1',
        'parent_results': {
            'private293_research_head': '1ae9ab3b0ec2193ffccdca78d32744a3aa6f516d',
            'private293_workflow_run_id': 33992072773,
            'private294_research_head': '64ee0e39e0b0e608d28f0318f4805899b7b6849e',
            'private294_workflow_run_id': 33992893536,
            'private295_research_head': '91765e08b87b5f248a9e859de7aac03bedfcb813',
            'private295_workflow_run_id': 33994009968,
            'all_parent_results_frozen': True,
        },
        'source': {
            'dataset': parent.REPO,
            'resolved_revision': parent.REVISION,
            'trace_manifest_sha256': parent.LOCKED_MANIFEST_SHA256,
            'publisher_readme_sha256': '4c5dbc3f66e8e1c9f21d486473d775c6c030f3a10e940c34304ee5a687bca727',
            'publisher_one_trace_per_session_semantics_frozen': True,
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
            'files_with_webfetch': files_with_webfetch,
            'missing_assistant_uuid': missing_uuid,
            'missing_tool_use_id': missing_tool_id,
            'missing_either_event_id_field': missing_either,
            'candidate_physical_unique_keys': len(candidate_keys),
            'duplicate_candidate_physical_records': duplicate_candidate_records,
            'unique_assistant_uuid_tool_use_id_pairs': len(pair_files),
            'assistant_uuid_tool_use_id_pairs_spanning_files': cross_file_pair_keys,
            'cross_file_pair_extra_records': cross_file_pair_extra_records,
            'files_participating_in_cross_file_pair_collisions': len(cross_file_pair_files),
            'exact_full_file_content_duplicate_groups': duplicate_content_groups,
            'exact_full_file_content_extra_duplicate_files': duplicate_content_extra_files,
        },
        'decision': {
            'verdict': verdict,
            'separate_overlap_study_authorized': verdict == 'FILE_SESSION_BOUNDARY_SUPPORTED_FOR_SEPARATE_OVERLAP_STUDY',
            'overlap_computed_in_private296': False,
            'reuse_authorized': False,
            'private293_reclassification_authorized': False,
        },
        'analysis_boundaries': {
            'publisher_file_boundary_used_as_candidate_session_coordinate': True,
            'header_values_compared': False,
            'operation_identity_constructed': False,
            'operation_overlap_computed': False,
            'url_or_prompt_fields_accessed_by_analysis_logic': False,
            'tool_result_values_accessed_by_analysis_logic': False,
            'company_issue_date_or_board_metadata_used_for_session_identity': False,
        },
        'privacy': {
            'aggregate_counts_only': True,
            'raw_file_paths_retained': False,
            'file_content_hashes_retained': False,
            'assistant_uuid_values_retained': False,
            'tool_use_id_values_retained': False,
            'urls_retained': False,
            'prompts_retained': False,
            'tool_results_retained': False,
            'header_values_retained': False,
        },
        'interpretation': {
            'identity_diagnostic_only': True,
            'reuse_evidence': False,
            'population_prevalence_evidence': False,
            'private285_class_pass_authorized': False,
            'production_change_authorized': False,
        },
    }

    pathlib.Path(args.output).write_text(json.dumps(report, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({
        'webfetch_records_seen': webfetch_records,
        'files_with_webfetch': files_with_webfetch,
        'duplicate_candidate_physical_records': duplicate_candidate_records,
        'assistant_uuid_tool_use_id_pairs_spanning_files': cross_file_pair_keys,
        'exact_full_file_content_duplicate_groups': duplicate_content_groups,
        'verdict': verdict,
    }, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
