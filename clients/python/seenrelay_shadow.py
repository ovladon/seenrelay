from __future__ import annotations

from copy import deepcopy
from math import isfinite
import time
from typing import Any, Callable, Mapping, Optional, TypeVar

from seenrelay import SeenRelayClient, ValidationContext

T = TypeVar("T")
_STATUSES = ("SAME_OBSERVED", "CHANGED_OBSERVED", "CONTESTED", "STALE", "UNKNOWN")


def _non_negative_finite(value: float, name: str) -> float:
    number = float(value)
    if not isfinite(number) or number < 0:
        raise ValueError(f"{name} must be a non-negative finite number")
    return number


def _empty_metrics() -> dict[str, Any]:
    return {
        "calls": 0,
        "checks_without_usable_response": 0,
        "conditional_hints_seen": 0,
        "validation_ms_total": 0.0,
        "same_observed_validation_ms": 0.0,
        "statuses": {status: 0 for status in _STATUSES},
    }


class SeenRelayShadowProof:
    """Measure SeenRelay in strict shadow mode without suppressing validation."""

    def __init__(self, client: SeenRelayClient) -> None:
        if not hasattr(client, "guard_detailed") or not hasattr(client, "get_telemetry"):
            raise TypeError("client must be a SeenRelayClient-compatible instance")
        self.client = client
        self._metrics = _empty_metrics()

    def reset(self) -> None:
        self._metrics = _empty_metrics()
        if hasattr(self.client, "reset_telemetry"):
            self.client.reset_telemetry()

    def snapshot(self) -> Mapping[str, Any]:
        metrics = deepcopy(self._metrics)
        calls = int(metrics["calls"])
        metrics["validation_ms_average"] = float(metrics["validation_ms_total"]) / calls if calls else 0.0
        return metrics

    def guard(
        self,
        *,
        fact: Mapping[str, Any],
        known_value: T,
        validate: Callable[[ValidationContext], T],
        max_age_seconds: Optional[int] = None,
        observation: Optional[Callable[[T, ValidationContext], Optional[Mapping[str, Any]]]] = None,
    ) -> T:
        validation_ms = 0.0

        def measured_validate(context: ValidationContext) -> T:
            nonlocal validation_ms
            started = time.monotonic()
            try:
                return validate(context)
            finally:
                validation_ms += max(0.0, (time.monotonic() - started) * 1000.0)

        result = self.client.guard_detailed(
            fact=fact,
            known_value=known_value,
            validate=measured_validate,
            reuse=None,
            max_age_seconds=max_age_seconds,
            observation=observation,
        )

        self._metrics["calls"] += 1
        self._metrics["validation_ms_total"] += validation_ms
        check = result.check
        status = check.get("status") if isinstance(check, Mapping) else None
        if status in _STATUSES:
            self._metrics["statuses"][status] += 1
            if status == "SAME_OBSERVED":
                self._metrics["same_observed_validation_ms"] += validation_ms
        else:
            self._metrics["checks_without_usable_response"] += 1

        hint = check.get("conditional_request_hint") if isinstance(check, Mapping) else None
        if isinstance(hint, Mapping):
            self._metrics["conditional_hints_seen"] += 1

        return result.value

    def report(
        self,
        *,
        avoided_validation_cost: float = 0.0,
        check_request_cost: float = 0.0,
        observe_request_cost: float = 0.0,
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
        prospective_relay_request_cost = (
            int(relay.check_network_requests) * check_cost
            + prospective_observe_requests * observe_cost
        )
        net_potential_savings = gross_potential_savings - prospective_relay_request_cost

        check_average_ms = float(relay.check_network_latency_ms_average)
        observe_average_ms = float(relay.observe_network_latency_ms_average)
        validation_average_ms = float(proof["validation_ms_average"])
        prospective_relay_latency_ms = (
            float(relay.check_network_latency_ms_total)
            + prospective_observe_requests * observe_average_ms
        )
        potential_net_time_saved_ms = float(proof["same_observed_validation_ms"]) - prospective_relay_latency_ms

        time_denominator = validation_average_ms + observe_average_ms
        break_even_reuse_rate_by_time = (
            (check_average_ms + observe_average_ms) / time_denominator
            if time_denominator > 0
            else None
        )
        cost_denominator = avoided + observe_cost
        break_even_reuse_rate_by_cost = (
            (check_cost + observe_cost) / cost_denominator
            if cost_denominator > 0
            else None
        )

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
            },
        }
