from __future__ import annotations

from math import ceil, floor, isfinite
from typing import Any, Mapping, Sequence

_STATUSES = ("SAME_OBSERVED", "CHANGED_OBSERVED", "CONTESTED", "STALE", "UNKNOWN")
_CONTROL_NAMES = ("local_cache", "source_native_conditional", "provider_native_cache")


def _non_negative(value: Any, name: str) -> float:
    number = float(value)
    if not isfinite(number) or number < 0:
        raise ValueError(f"{name} must be a non-negative finite number")
    return number


def _percentile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = floor(position)
    upper = ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def _compare(candidate: float, baseline: float) -> str:
    if candidate < baseline:
        return "better"
    if candidate > baseline:
        return "worse"
    return "equal"


def _safety_summary(opportunities: int, unsafe: int, unavailable: int) -> tuple[str, Any]:
    if opportunities == 0:
        return "no_opportunities", None
    if unsafe > 0:
        return "fail", False
    if unavailable > 0:
        return "incomplete", None
    return "pass", True


def evaluate_hostile_benchmark(input_data: Mapping[str, Any]) -> Mapping[str, Any]:
    """Evaluate sanitized workload evidence against the best non-shared path.

    This evaluator reports evidence only. It never enables reuse.
    """
    if not isinstance(input_data, Mapping):
        raise TypeError("benchmark input must be a mapping")
    schema_version = input_data.get("schema_version")
    if schema_version not in (1, 2):
        raise ValueError("schema_version must be 1 or 2")
    schema_v2 = schema_version == 2

    sample_type = input_data.get("sample_type")
    if sample_type not in ("natural_workload", "fixed_fact_smoke"):
        raise ValueError("sample_type must be natural_workload or fixed_fact_smoke")
    if input_data.get("baseline_definition") != "best_existing_non_shared_path":
        raise ValueError("baseline_definition must be best_existing_non_shared_path")

    controls = input_data.get("controls")
    if not isinstance(controls, Mapping):
        raise TypeError("controls must be a mapping")
    clean_controls: dict[str, dict[str, bool]] = {}
    for name in _CONTROL_NAMES:
        control = controls.get(name)
        if not isinstance(control, Mapping):
            raise TypeError(f"controls.{name} must declare available and measured booleans")
        available = control.get("available")
        measured = control.get("measured")
        if not isinstance(available, bool) or not isinstance(measured, bool):
            raise TypeError(f"controls.{name} must declare available and measured booleans")
        if available and not measured:
            raise RuntimeError(f"hostile benchmark incomplete: {name} is available but was not measured")
        clean_controls[name] = {"available": available, "measured": measured}

    records = input_data.get("records")
    if not isinstance(records, list) or not records:
        raise TypeError("records must be a non-empty list")
    observe_off_critical_path = input_data.get("observe_off_critical_path") is True

    baseline_latency: list[float] = []
    prospective_latency: list[float] = []
    baseline_cost: list[float] = []
    prospective_cost: list[float] = []
    status_counts = {status: 0 for status in _STATUSES}
    status_counts["CHECK_UNAVAILABLE"] = 0
    policy_accepted_reuses = 0
    unsafe_hypothetical_reuses = 0
    comparison_unavailable = 0
    prospective_observe_requests = 0

    for index, record in enumerate(records):
        if not isinstance(record, Mapping):
            raise TypeError(f"records[{index}] must be a mapping")
        check_status = record.get("check_status")
        if schema_v2:
            if check_status is not None and check_status not in _STATUSES:
                raise ValueError(f"records[{index}].check_status is invalid")
        elif check_status not in _STATUSES:
            raise ValueError(f"records[{index}].check_status is invalid")

        policy_reusable = record.get("policy_reusable")
        observe_after_baseline = record.get("observe_after_baseline")
        if not isinstance(policy_reusable, bool):
            raise TypeError(f"records[{index}].policy_reusable must be boolean")
        if not isinstance(observe_after_baseline, bool):
            raise TypeError(f"records[{index}].observe_after_baseline must be boolean")
        if policy_reusable and check_status != "SAME_OBSERVED":
            raise RuntimeError(f"records[{index}] cannot be policy_reusable unless CHECK is SAME_OBSERVED")

        match = record.get("reuse_would_match_validation")
        if policy_reusable:
            if schema_v2:
                if match is not None and not isinstance(match, bool):
                    raise TypeError(
                        f"records[{index}].reuse_would_match_validation must be boolean or None for policy-reusable records"
                    )
            elif not isinstance(match, bool):
                raise TypeError(
                    f"records[{index}].reuse_would_match_validation must be boolean for policy-reusable records"
                )

        base_ms = _non_negative(record.get("baseline_ms"), f"records[{index}].baseline_ms")
        base_cost = _non_negative(record.get("baseline_cost"), f"records[{index}].baseline_cost")
        check_ms = _non_negative(record.get("check_ms"), f"records[{index}].check_ms")
        observe_ms = _non_negative(record.get("observe_ms"), f"records[{index}].observe_ms")
        check_cost = _non_negative(record.get("check_cost"), f"records[{index}].check_cost")
        observe_cost = _non_negative(record.get("observe_cost"), f"records[{index}].observe_cost")

        reuse = check_status == "SAME_OBSERVED" and policy_reusable
        observe = (not reuse) and observe_after_baseline
        if check_status is None:
            status_counts["CHECK_UNAVAILABLE"] += 1
        else:
            status_counts[str(check_status)] += 1
        if reuse:
            policy_accepted_reuses += 1
            if match is False:
                unsafe_hypothetical_reuses += 1
            if match is None:
                comparison_unavailable += 1
        if observe:
            prospective_observe_requests += 1

        baseline_latency.append(base_ms)
        baseline_cost.append(base_cost)
        prospective_latency.append(
            check_ms + (0.0 if reuse else base_ms) + (observe_ms if observe and not observe_off_critical_path else 0.0)
        )
        prospective_cost.append(check_cost + (0.0 if reuse else base_cost) + (observe_cost if observe else 0.0))

    baseline_latency_total = sum(baseline_latency)
    prospective_latency_total = sum(prospective_latency)
    baseline_cost_total = sum(baseline_cost)
    prospective_cost_total = sum(prospective_cost)
    calls = len(records)
    safety_state, safety_pass = _safety_summary(
        policy_accepted_reuses, unsafe_hypothetical_reuses, comparison_unavailable
    )
    positive_on_latency = prospective_latency_total < baseline_latency_total
    positive_on_cost = prospective_cost_total < baseline_cost_total

    return {
        "schema_version": schema_version,
        "evaluator_version": 2,
        "workload_id": input_data.get("workload_id") if isinstance(input_data.get("workload_id"), str) else None,
        "sample_type": sample_type,
        "evidence_scope": "workload_evidence" if sample_type == "natural_workload" else "mechanics_only",
        "baseline_definition": "best_existing_non_shared_path",
        "controls": clean_controls,
        "observe_off_critical_path": observe_off_critical_path,
        "calls": calls,
        "status_counts": status_counts,
        "policy_accepted_reuses": policy_accepted_reuses,
        "policy_accepted_reuse_rate": policy_accepted_reuses / calls,
        "unsafe_hypothetical_reuses": unsafe_hypothetical_reuses,
        "reuse_comparison_unavailable": comparison_unavailable,
        "prospective_observe_requests": prospective_observe_requests,
        "safety": {
            "authoritative_shadow_validation_required": True,
            "policy_reuse_opportunities": policy_accepted_reuses,
            "unsafe_hypothetical_reuses": unsafe_hypothetical_reuses,
            "comparison_unavailable": comparison_unavailable,
            "state": safety_state,
            "pass": safety_pass,
        },
        "latency": {
            "baseline_total_ms": baseline_latency_total,
            "prospective_total_ms": prospective_latency_total,
            "delta_ms": prospective_latency_total - baseline_latency_total,
            "outcome": _compare(prospective_latency_total, baseline_latency_total),
            "improvement_percent": (
                ((baseline_latency_total - prospective_latency_total) / baseline_latency_total) * 100
                if baseline_latency_total > 0 else None
            ),
            "baseline_p50_ms": _percentile(baseline_latency, 0.5),
            "baseline_p95_ms": _percentile(baseline_latency, 0.95),
            "prospective_p50_ms": _percentile(prospective_latency, 0.5),
            "prospective_p95_ms": _percentile(prospective_latency, 0.95),
        },
        "cost": {
            "baseline_total_units": baseline_cost_total,
            "prospective_total_units": prospective_cost_total,
            "delta_units": prospective_cost_total - baseline_cost_total,
            "outcome": _compare(prospective_cost_total, baseline_cost_total),
            "improvement_percent": (
                ((baseline_cost_total - prospective_cost_total) / baseline_cost_total) * 100
                if baseline_cost_total > 0 else None
            ),
        },
        "decision": {
            "safety_pass": safety_pass,
            "evidence_ready": safety_pass is True,
            "positive_on_latency": positive_on_latency,
            "positive_on_cost": positive_on_cost,
            "beats_baseline_on_both": safety_pass is True and positive_on_latency and positive_on_cost,
            "automatic_reuse_enabled_by_evaluator": False,
        },
    }
