from __future__ import annotations

from copy import deepcopy
import json
from math import isfinite
import time
from typing import Any, Callable, Mapping, Optional, TypeVar

from seenrelay import ReuseDecision, SeenRelayClient, ValidationContext

T = TypeVar("T")
_STATUSES = ("SAME_OBSERVED", "CHANGED_OBSERVED", "CONTESTED", "STALE", "UNKNOWN")
_CONTROL_NAMES = ("local_cache", "source_native_conditional", "provider_native_cache")


def _non_negative_finite(value: float, name: str) -> float:
    number = float(value)
    if not isfinite(number) or number < 0:
        raise ValueError(f"{name} must be a non-negative finite number")
    return number


def _positive_integer(value: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _empty_metrics() -> dict[str, Any]:
    return {
        "calls": 0,
        "checks_without_usable_response": 0,
        "conditional_hints_seen": 0,
        "validation_ms_total": 0.0,
        "same_observed_validation_ms": 0.0,
        "same_observed_matches_validation": 0,
        "same_observed_mismatches_validation": 0,
        "same_observed_comparison_unavailable": 0,
        "statuses": {status: 0 for status in _STATUSES},
    }


def _safety_summary(metrics: Mapping[str, Any]) -> dict[str, Any]:
    opportunities = int(metrics["statuses"]["SAME_OBSERVED"])
    matches = int(metrics["same_observed_matches_validation"])
    mismatches = int(metrics["same_observed_mismatches_validation"])
    unavailable = int(metrics["same_observed_comparison_unavailable"])
    comparable = matches + mismatches
    agreement_rate = matches / comparable if comparable else None
    if opportunities == 0:
        return {"state": "no_opportunities", "pass": None, "comparable": comparable, "agreement_rate": agreement_rate}
    if mismatches > 0:
        return {"state": "fail", "pass": False, "comparable": comparable, "agreement_rate": agreement_rate}
    if unavailable > 0:
        return {"state": "incomplete", "pass": None, "comparable": comparable, "agreement_rate": agreement_rate}
    return {"state": "pass", "pass": True, "comparable": comparable, "agreement_rate": agreement_rate}


def _sanitize_controls(controls: Mapping[str, Any]) -> dict[str, dict[str, bool]]:
    if not isinstance(controls, Mapping):
        raise TypeError("controls must be a mapping")
    out: dict[str, dict[str, bool]] = {}
    for name in _CONTROL_NAMES:
        control = controls.get(name)
        if not isinstance(control, Mapping):
            raise TypeError(f"controls.{name} must declare available and measured booleans")
        available = control.get("available")
        measured = control.get("measured")
        if not isinstance(available, bool) or not isinstance(measured, bool):
            raise TypeError(f"controls.{name} must declare available and measured booleans")
        out[name] = {"available": available, "measured": measured}
    return out


def _telemetry_delta(before: Any, after: Any, field: str) -> float:
    return float(getattr(after, field, 0.0)) - float(getattr(before, field, 0.0))


def _network_timing_delta(before: Any, after: Any, prefix: str) -> tuple[float, bool]:
    request_field = f"{prefix}_network_requests"
    latency_field = f"{prefix}_network_latency_ms_total"
    count = int(getattr(after, request_field, 0)) - int(getattr(before, request_field, 0))
    latency = _telemetry_delta(before, after, latency_field)
    if count not in (0, 1) or latency < 0:
        return 0.0, False
    return max(0.0, latency), True


def _call_scope_unambiguous(before: Any, after: Any) -> bool:
    expected = {
        "guard_calls": 1,
        "check_calls": 1,
        "validation_calls": 1,
        "observe_attempts": 1,
    }
    for field, expected_delta in expected.items():
        if not hasattr(before, field) or not hasattr(after, field):
            continue
        if int(getattr(after, field)) - int(getattr(before, field)) != expected_delta:
            return False
    return True


def _decision_parts(decision: Any) -> tuple[bool, Any]:
    if isinstance(decision, ReuseDecision):
        return bool(decision.reuse), decision.value
    if isinstance(decision, Mapping) and isinstance(decision.get("reuse"), bool):
        return bool(decision["reuse"]), decision.get("value")
    if hasattr(decision, "reuse") and isinstance(getattr(decision, "reuse"), bool):
        return bool(getattr(decision, "reuse")), getattr(decision, "value", None)
    raise TypeError("reuse policy returned invalid decision")


class SeenRelayShadowProof:
    """Measure SeenRelay in strict shadow mode without suppressing validation.

    Benchmark records are local-only and sanitized. They contain no fact
    descriptor, source, raw value, result, or per-call timestamp.
    """

    def __init__(self, client: SeenRelayClient, *, benchmark_record_limit: int = 10_000) -> None:
        if not hasattr(client, "guard_detailed") or not hasattr(client, "get_telemetry"):
            raise TypeError("client must be a SeenRelayClient-compatible instance")
        self.client = client
        self.benchmark_record_limit = _positive_integer(benchmark_record_limit, "benchmark_record_limit")
        self._metrics = _empty_metrics()
        self._benchmark_records: list[dict[str, Any]] = []
        self._benchmark_records_dropped = 0
        self._benchmark_invalid_reasons: set[str] = set()

    def reset(self) -> None:
        self._metrics = _empty_metrics()
        self._benchmark_records = []
        self._benchmark_records_dropped = 0
        self._benchmark_invalid_reasons = set()
        if hasattr(self.client, "reset_telemetry"):
            self.client.reset_telemetry()

    def snapshot(self) -> Mapping[str, Any]:
        metrics = deepcopy(self._metrics)
        calls = int(metrics["calls"])
        metrics["validation_ms_average"] = float(metrics["validation_ms_total"]) / calls if calls else 0.0
        safety = _safety_summary(metrics)
        metrics["same_observed_comparable"] = safety["comparable"]
        metrics["same_observed_agreement_rate"] = safety["agreement_rate"]
        metrics["safety_evidence"] = safety["state"]
        metrics["safety_pass"] = safety["pass"]
        return metrics

    def benchmark_snapshot(self) -> Mapping[str, Any]:
        return {
            "records_retained": len(self._benchmark_records),
            "records_dropped": self._benchmark_records_dropped,
            "record_limit": self.benchmark_record_limit,
            "invalid_reasons": sorted(self._benchmark_invalid_reasons),
            "raw_values_retained": False,
            "fact_identity_retained": False,
            "sources_retained": False,
            "timestamps_retained": False,
        }

    def _capture_benchmark_record(
        self,
        *,
        benchmark: Mapping[str, Any],
        known_value: Any,
        validated_value: Any,
        check: Optional[Mapping[str, Any]],
        validation_ms: float,
        check_ms: float,
        observe_ms: float,
        timings_unambiguous: bool,
    ) -> None:
        if len(self._benchmark_records) >= self.benchmark_record_limit:
            self._benchmark_records_dropped += 1
            return
        if not timings_unambiguous:
            self._benchmark_invalid_reasons.add("ambiguous_per_call_relay_timings")
            return

        status = check.get("status") if isinstance(check, Mapping) else None
        if status not in _STATUSES:
            status = None
        policy_reusable = False
        reuse_would_match_validation: Optional[bool] = None
        reuse_policy = benchmark.get("reuse")
        if reuse_policy is not None:
            if not callable(reuse_policy):
                self._benchmark_invalid_reasons.add("reuse_policy_not_callable")
                return
            if check is not None:
                try:
                    reuse, decision_value = _decision_parts(reuse_policy(check, known_value))
                except Exception:
                    self._benchmark_invalid_reasons.add("reuse_policy_threw_or_returned_invalid_decision")
                    return
                if reuse:
                    if status != "SAME_OBSERVED":
                        self._benchmark_invalid_reasons.add("reuse_policy_accepted_non_same_observed")
                        return
                    policy_reusable = True
                    try:
                        reuse_would_match_validation = _stable_json(decision_value) == _stable_json(validated_value)
                    except (TypeError, ValueError):
                        reuse_would_match_validation = None

        observe_after_baseline = benchmark.get("observe_after_baseline", True)
        if not isinstance(observe_after_baseline, bool):
            self._benchmark_invalid_reasons.add("observe_after_baseline_not_boolean")
            return
        try:
            baseline_cost = _non_negative_finite(benchmark.get("baseline_cost", 0), "benchmark.baseline_cost")
            check_cost = _non_negative_finite(benchmark.get("check_cost", 0), "benchmark.check_cost")
            observe_cost = _non_negative_finite(benchmark.get("observe_cost", 0), "benchmark.observe_cost")
        except (TypeError, ValueError):
            self._benchmark_invalid_reasons.add("invalid_cost_input")
            return

        self._benchmark_records.append({
            "check_status": status,
            "policy_reusable": policy_reusable,
            "reuse_would_match_validation": reuse_would_match_validation if policy_reusable else None,
            "observe_after_baseline": observe_after_baseline,
            "baseline_ms": max(0.0, float(validation_ms)),
            "baseline_cost": baseline_cost,
            "check_ms": max(0.0, float(check_ms)),
            "observe_ms": max(0.0, float(observe_ms)),
            "check_cost": check_cost,
            "observe_cost": observe_cost,
        })

    def hostile_benchmark_input(
        self,
        *,
        workload_id: Optional[str] = None,
        controls: Mapping[str, Any],
        observe_off_critical_path: bool = False,
    ) -> Mapping[str, Any]:
        snapshot = self.benchmark_snapshot()
        invalid = list(snapshot["invalid_reasons"])
        if invalid:
            raise RuntimeError(f"natural workload benchmark is incomplete: {', '.join(invalid)}")
        if int(snapshot["records_dropped"]) > 0:
            raise RuntimeError(
                f"natural workload benchmark is incomplete: {snapshot['records_dropped']} records exceeded the configured limit"
            )
        if int(snapshot["records_retained"]) == 0:
            raise RuntimeError("no natural workload benchmark records were retained")
        if workload_id is not None and not isinstance(workload_id, str):
            raise TypeError("workload_id must be a string or None")
        if not isinstance(observe_off_critical_path, bool):
            raise TypeError("observe_off_critical_path must be boolean")
        return {
            "schema_version": 2,
            "workload_id": workload_id,
            "sample_type": "natural_workload",
            "baseline_definition": "best_existing_non_shared_path",
            "controls": _sanitize_controls(controls),
            "observe_off_critical_path": observe_off_critical_path,
            "records": deepcopy(self._benchmark_records),
        }

    def guard(
        self,
        *,
        fact: Mapping[str, Any],
        known_value: T,
        validate: Callable[[ValidationContext], T],
        max_age_seconds: Optional[int] = None,
        observation: Optional[Callable[[T, ValidationContext], Optional[Mapping[str, Any]]]] = None,
        benchmark: Optional[Mapping[str, Any]] = None,
    ) -> T:
        validation_ms = 0.0

        def measured_validate(context: ValidationContext) -> T:
            nonlocal validation_ms
            started = time.monotonic()
            try:
                return validate(context)
            finally:
                validation_ms += max(0.0, (time.monotonic() - started) * 1000.0)

        before = self.client.get_telemetry()
        result = self.client.guard_detailed(
            fact=fact,
            known_value=known_value,
            validate=measured_validate,
            reuse=None,
            max_age_seconds=max_age_seconds,
            observation=observation,
        )
        after = self.client.get_telemetry()

        self._metrics["calls"] += 1
        self._metrics["validation_ms_total"] += validation_ms
        check = result.check
        status = check.get("status") if isinstance(check, Mapping) else None
        if status in _STATUSES:
            self._metrics["statuses"][status] += 1
            if status == "SAME_OBSERVED":
                self._metrics["same_observed_validation_ms"] += validation_ms
                try:
                    if _stable_json(known_value) == _stable_json(result.value):
                        self._metrics["same_observed_matches_validation"] += 1
                    else:
                        self._metrics["same_observed_mismatches_validation"] += 1
                except (TypeError, ValueError):
                    self._metrics["same_observed_comparison_unavailable"] += 1
        else:
            self._metrics["checks_without_usable_response"] += 1

        hint = check.get("conditional_request_hint") if isinstance(check, Mapping) else None
        if isinstance(hint, Mapping):
            self._metrics["conditional_hints_seen"] += 1

        if benchmark is not None:
            if not isinstance(benchmark, Mapping):
                self._benchmark_invalid_reasons.add("benchmark_not_mapping")
            else:
                check_ms, check_ok = _network_timing_delta(before, after, "check")
                observe_ms, observe_ok = _network_timing_delta(before, after, "observe")
                self._capture_benchmark_record(
                    benchmark=benchmark,
                    known_value=known_value,
                    validated_value=result.value,
                    check=check,
                    validation_ms=validation_ms,
                    check_ms=check_ms,
                    observe_ms=observe_ms,
                    timings_unambiguous=check_ok and observe_ok and _call_scope_unambiguous(before, after),
                )
        return result.value

    def report(
        self,
        *,
        avoided_validation_cost: float = 0.0,
        check_request_cost: float = 0.0,
        observe_request_cost: float = 0.0,
        observe_off_critical_path: bool = False,
    ) -> Mapping[str, Any]:
        avoided = _non_negative_finite(avoided_validation_cost, "avoided_validation_cost")
        check_cost = _non_negative_finite(check_request_cost, "check_request_cost")
        observe_cost = _non_negative_finite(observe_request_cost, "observe_request_cost")
        proof = self.snapshot()
        relay = self.client.get_telemetry()

        calls = int(proof["calls"])
        same = int(proof["statuses"]["SAME_OBSERVED"])
        observed_same_rate = same / calls if calls else 0.0
        prospective_observe_requests = max(0, int(relay.observe_network_requests) - same)
        gross_potential_savings = same * avoided
        prospective_relay_request_cost = int(relay.check_network_requests) * check_cost + prospective_observe_requests * observe_cost
        net_potential_savings = gross_potential_savings - prospective_relay_request_cost

        check_average_ms = float(relay.check_network_latency_ms_average)
        observe_average_ms = float(relay.observe_network_latency_ms_average)
        validation_average_ms = float(proof["validation_ms_average"])
        off_critical_path = bool(observe_off_critical_path)
        prospective_relay_latency_ms = float(relay.check_network_latency_ms_total) + (
            0.0 if off_critical_path else prospective_observe_requests * observe_average_ms
        )
        potential_net_time_saved_ms = float(proof["same_observed_validation_ms"]) - prospective_relay_latency_ms

        if off_critical_path:
            break_even_reuse_rate_by_time = check_average_ms / validation_average_ms if validation_average_ms > 0 else None
        else:
            time_denominator = validation_average_ms + observe_average_ms
            break_even_reuse_rate_by_time = (
                (check_average_ms + observe_average_ms) / time_denominator if time_denominator > 0 else None
            )
        cost_denominator = avoided + observe_cost
        break_even_reuse_rate_by_cost = (
            (check_cost + observe_cost) / cost_denominator if cost_denominator > 0 else None
        )

        safety_pass = proof["safety_pass"]
        return {
            "mode": "shadow-proof",
            "calls": calls,
            "status_counts": deepcopy(proof["statuses"]),
            "observed_same_rate": observed_same_rate,
            "conditional_hints_seen": int(proof["conditional_hints_seen"]),
            "validation_ms_average": validation_average_ms,
            "check_network_latency_ms_average": check_average_ms,
            "observe_network_latency_ms_average": observe_average_ms,
            "potential_validation_calls_avoided": same,
            "gross_potential_savings": gross_potential_savings,
            "prospective_relay_request_cost": prospective_relay_request_cost,
            "net_potential_savings": net_potential_savings,
            "same_observed_validation_ms": float(proof["same_observed_validation_ms"]),
            "same_observed_matches_validation": int(proof["same_observed_matches_validation"]),
            "same_observed_mismatches_validation": int(proof["same_observed_mismatches_validation"]),
            "same_observed_comparison_unavailable": int(proof["same_observed_comparison_unavailable"]),
            "same_observed_comparable": int(proof["same_observed_comparable"]),
            "same_observed_agreement_rate": proof["same_observed_agreement_rate"],
            "safety_evidence": proof["safety_evidence"],
            "safety_pass": safety_pass,
            "safety_adjusted_gross_potential_savings": gross_potential_savings if safety_pass is True else None,
            "safety_adjusted_net_potential_savings": net_potential_savings if safety_pass is True else None,
            "prospective_relay_latency_ms": prospective_relay_latency_ms,
            "potential_net_time_saved_ms": potential_net_time_saved_ms,
            "break_even_reuse_rate_by_time": break_even_reuse_rate_by_time,
            "break_even_reuse_rate_by_cost": break_even_reuse_rate_by_cost,
            "assumptions": {
                "direct_reuse_only": True,
                "conditional_request_savings_excluded": True,
                "active_mode_would_not_observe_direct_reuse_hits": True,
                "caller_supplied_cost_units": True,
                "no_savings_claim_when_same_observed_is_zero": True,
                "authoritative_validation_always_runs": True,
                "raw_values_retained_by_shadow_proof": False,
                "observe_off_critical_path": off_critical_path,
            },
        }
