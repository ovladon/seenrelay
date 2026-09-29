#!/usr/bin/env python3
"""Conservative exact-repeat census for public OptiQ Lab web_search traces.

This is external workload characterization, not SeenRelay ROI evidence.
The dataset uses DuckDuckGo without an API key, so dollar savings remain unknown.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def normalize_query(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", value.strip().lower())


def canonical_args(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def parse_args(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def iter_sessions(root: Path):
    for path in sorted(root.rglob("*.jsonl")):
        session = None
        messages = []
        with path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
                if record.get("type") == "session":
                    session = record
                elif record.get("type") == "message" and isinstance(record.get("message"), dict):
                    messages.append(record["message"])
        if session is not None:
            yield path, session, messages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_dir", type=Path)
    parser.add_argument("--out", type=Path, default=Path("optiq-web-search-repeat-census.json"))
    args = parser.parse_args()

    sessions_total = 0
    mode_counts: Counter[str] = Counter()
    model_counts: Counter[str] = Counter()
    web_calls = 0
    query_calls = 0
    url_calls = 0
    malformed_argument_calls = 0

    exact_query_calls: Counter[str] = Counter()
    normalized_query_calls: Counter[str] = Counter()
    exact_url_calls: Counter[str] = Counter()

    exact_query_sessions: dict[str, set[str]] = defaultdict(set)
    normalized_query_sessions: dict[str, set[str]] = defaultdict(set)
    exact_url_sessions: dict[str, set[str]] = defaultdict(set)

    within_session_exact_query_extra = 0
    within_session_normalized_query_extra = 0
    within_session_exact_url_extra = 0
    same_message_exact_query_extra = 0
    same_message_normalized_query_extra = 0
    same_message_exact_url_extra = 0
    cross_message_exact_query_extra = 0
    cross_message_normalized_query_extra = 0
    cross_message_exact_url_extra = 0

    sessions_with_exact_query_repeat = 0
    sessions_with_normalized_query_repeat = 0
    sessions_with_exact_url_repeat = 0

    top_session_rows = []

    for path, session, messages in iter_sessions(args.dataset_dir):
        sessions_total += 1
        sid = str(session.get("id") or path.stem)
        mode = str(session.get("mode") or "<unknown>")
        model = str(session.get("model") or "<unknown>")
        mode_counts[mode] += 1
        model_counts[model] += 1

        session_exact_queries: Counter[str] = Counter()
        session_normalized_queries: Counter[str] = Counter()
        session_exact_urls: Counter[str] = Counter()
        message_exact_query_duplicates = 0
        message_normalized_query_duplicates = 0
        message_exact_url_duplicates = 0

        for message in messages:
            tool_calls = message.get("toolCalls")
            if not isinstance(tool_calls, list):
                tool_calls = message.get("tool_calls")
            if not isinstance(tool_calls, list):
                continue

            msg_exact_queries: Counter[str] = Counter()
            msg_normalized_queries: Counter[str] = Counter()
            msg_exact_urls: Counter[str] = Counter()

            for call in tool_calls:
                if not isinstance(call, dict):
                    continue
                fn = call.get("function")
                if not isinstance(fn, dict) or fn.get("name") != "web_search":
                    continue
                web_calls += 1
                parsed = parse_args(fn.get("arguments"))
                if parsed is None:
                    malformed_argument_calls += 1
                    continue

                if isinstance(parsed.get("query"), str) and parsed["query"].strip():
                    q = parsed["query"].strip()
                    nq = normalize_query(q)
                    query_calls += 1
                    exact_query_calls[q] += 1
                    normalized_query_calls[nq] += 1
                    exact_query_sessions[q].add(sid)
                    normalized_query_sessions[nq].add(sid)
                    session_exact_queries[q] += 1
                    session_normalized_queries[nq] += 1
                    msg_exact_queries[q] += 1
                    msg_normalized_queries[nq] += 1
                elif isinstance(parsed.get("url"), str) and parsed["url"].strip():
                    u = parsed["url"].strip()
                    url_calls += 1
                    exact_url_calls[u] += 1
                    exact_url_sessions[u].add(sid)
                    session_exact_urls[u] += 1
                    msg_exact_urls[u] += 1

            message_exact_query_duplicates += sum(c - 1 for c in msg_exact_queries.values() if c > 1)
            message_normalized_query_duplicates += sum(c - 1 for c in msg_normalized_queries.values() if c > 1)
            message_exact_url_duplicates += sum(c - 1 for c in msg_exact_urls.values() if c > 1)

        seq_exact_query_extra = sum(c - 1 for c in session_exact_queries.values() if c > 1)
        seq_norm_query_extra = sum(c - 1 for c in session_normalized_queries.values() if c > 1)
        seq_url_extra = sum(c - 1 for c in session_exact_urls.values() if c > 1)

        if seq_exact_query_extra:
            sessions_with_exact_query_repeat += 1
        if seq_norm_query_extra:
            sessions_with_normalized_query_repeat += 1
        if seq_url_extra:
            sessions_with_exact_url_repeat += 1

        within_session_exact_query_extra += seq_exact_query_extra
        within_session_normalized_query_extra += seq_norm_query_extra
        within_session_exact_url_extra += seq_url_extra
        same_message_exact_query_extra += message_exact_query_duplicates
        same_message_normalized_query_extra += message_normalized_query_duplicates
        same_message_exact_url_extra += message_exact_url_duplicates
        cross_message_exact_query_extra += max(0, seq_exact_query_extra - message_exact_query_duplicates)
        cross_message_normalized_query_extra += max(0, seq_norm_query_extra - message_normalized_query_duplicates)
        cross_message_exact_url_extra += max(0, seq_url_extra - message_exact_url_duplicates)

        if seq_exact_query_extra or seq_norm_query_extra or seq_url_extra:
            top_session_rows.append({
                "session_id": sid,
                "mode": mode,
                "model": model,
                "name": session.get("name"),
                "web_search_calls": sum(session_exact_queries.values()) + sum(session_exact_urls.values()),
                "exact_query_extra": seq_exact_query_extra,
                "normalized_query_extra": seq_norm_query_extra,
                "exact_url_extra": seq_url_extra,
                "same_message_exact_query_extra": message_exact_query_duplicates,
                "same_message_normalized_query_extra": message_normalized_query_duplicates,
                "same_message_exact_url_extra": message_exact_url_duplicates,
            })

    corpus_exact_query_extra = sum(c - 1 for c in exact_query_calls.values() if c > 1)
    corpus_normalized_query_extra = sum(c - 1 for c in normalized_query_calls.values() if c > 1)
    corpus_exact_url_extra = sum(c - 1 for c in exact_url_calls.values() if c > 1)

    cross_session_exact_query_keys = {k: s for k, s in exact_query_sessions.items() if len(s) > 1}
    cross_session_normalized_query_keys = {k: s for k, s in normalized_query_sessions.items() if len(s) > 1}
    cross_session_exact_url_keys = {k: s for k, s in exact_url_sessions.items() if len(s) > 1}

    top_exact_queries = [
        {"query": q, "calls": c, "sessions": len(exact_query_sessions[q])}
        for q, c in exact_query_calls.most_common(50)
        if c > 1
    ]
    top_normalized_queries = [
        {"normalized_query": q, "calls": c, "sessions": len(normalized_query_sessions[q])}
        for q, c in normalized_query_calls.most_common(50)
        if c > 1
    ]
    top_urls = [
        {"url": u, "calls": c, "sessions": len(exact_url_sessions[u])}
        for u, c in exact_url_calls.most_common(50)
        if c > 1
    ]
    top_session_rows.sort(
        key=lambda row: (
            row["normalized_query_extra"] + row["exact_url_extra"],
            row["web_search_calls"],
        ),
        reverse=True,
    )

    report = {
        "schema_version": "seenrelay-optiq-web-search-repeat-census-v1",
        "evidence_class": "external_public_trace_characterization",
        "dataset": {
            "name": "mlx-community/optiq-lab-traces",
            "pinned_revision": "05f81b5bfb8244c2886d25dadd3815560d705ca2",
            "license": "CC BY 4.0",
            "known_provider_control": "OptiQ Lab web_search uses DuckDuckGo without an API key.",
            "natural_customer_roi": False,
        },
        "population": {
            "sessions": sessions_total,
            "modes": dict(mode_counts),
            "models": dict(model_counts),
            "web_search_tool_calls": web_calls,
            "query_calls": query_calls,
            "url_fetch_calls": url_calls,
            "malformed_argument_calls": malformed_argument_calls,
        },
        "within_session": {
            "sessions_with_exact_query_repeat": sessions_with_exact_query_repeat,
            "sessions_with_normalized_query_repeat": sessions_with_normalized_query_repeat,
            "sessions_with_exact_url_repeat": sessions_with_exact_url_repeat,
            "exact_query_extra_calls": within_session_exact_query_extra,
            "normalized_query_extra_calls": within_session_normalized_query_extra,
            "exact_url_extra_calls": within_session_exact_url_extra,
            "same_assistant_message_exact_query_extra_calls": same_message_exact_query_extra,
            "same_assistant_message_normalized_query_extra_calls": same_message_normalized_query_extra,
            "same_assistant_message_exact_url_extra_calls": same_message_exact_url_extra,
            "cross_message_exact_query_extra_calls": cross_message_exact_query_extra,
            "cross_message_normalized_query_extra_calls": cross_message_normalized_query_extra,
            "cross_message_exact_url_extra_calls": cross_message_exact_url_extra,
        },
        "whole_corpus": {
            "unique_exact_queries": len(exact_query_calls),
            "unique_normalized_queries": len(normalized_query_calls),
            "unique_exact_urls": len(exact_url_calls),
            "exact_query_extra_calls_if_global_identity_were_shareable": corpus_exact_query_extra,
            "normalized_query_extra_calls_if_global_identity_were_shareable": corpus_normalized_query_extra,
            "exact_url_extra_calls_if_global_identity_were_shareable": corpus_exact_url_extra,
            "exact_query_keys_seen_in_multiple_sessions": len(cross_session_exact_query_keys),
            "normalized_query_keys_seen_in_multiple_sessions": len(cross_session_normalized_query_keys),
            "exact_url_keys_seen_in_multiple_sessions": len(cross_session_exact_url_keys),
        },
        "economics": {
            "observed_paid_provider_cost_usd": None,
            "dollar_savings_claim": None,
            "net_savings_claim": None,
            "reason": "The source workload uses DuckDuckGo without an API key and does not expose a marginal search price. Repeat counts are opportunity candidates only, not avoided cost.",
        },
        "interpretation": {
            "distributed_fleet_overlap_claim": False,
            "freshness_equivalence_claim": False,
            "same_message_duplicates_note": "Same assistant-message exact duplicates are the strongest concurrency/fan-out candidates, but executor/process identity is absent, so local single-flight remains the first control.",
            "cross_message_duplicates_note": "Cross-message exact repeats are temporal reuse candidates only; safe reuse requires caller-defined freshness and outcome-equivalence measurement.",
            "cross_session_duplicates_note": "Cross-session recurrence is descriptive only. The dataset does not establish a shared trust/freshness boundary across sessions.",
        },
        "top_repeated_exact_queries": top_exact_queries,
        "top_repeated_normalized_queries": top_normalized_queries,
        "top_repeated_exact_urls": top_urls,
        "top_sessions_with_repeats": top_session_rows[:50],
    }

    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
