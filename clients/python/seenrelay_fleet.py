"""Distributed shadow-only fleet overlap measurement for Python.

This module never suppresses the caller's authoritative operation, never shares
results, and never calls hosted SeenRelay CHECK/OBSERVE. It only classifies
whether an eligible exact call started while the same caller-scoped coordinate
was already in flight through a caller-owned coordination store.
"""
from __future__ import annotations

import inspect
import math
import time
import uuid
from typing import Any, Callable, Mapping, Optional

from seenrelay_zero_state import sha256_json_fingerprint


def _maybe(mapping: Mapping[str, Any], snake: str, camel: str, default: Any = None) -> Any:
    if snake in mapping:
        return mapping[snake]
    if camel in mapping:
        return mapping[camel]
    return default


def _positive_finite(value: Any, fallback: float, label: str) -> float:
    raw = fallback if value is None else value
    try:
        n = float(raw)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{label} must be a positive finite number") from exc
    if not math.isfinite(n) or n <= 0:
        raise TypeError(f"{label} must be a positive finite number")
    return n


def _non_negative_finite(value: Any, label: str) -> Optional[float]:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{label} must be a non-negative finite number") from exc
    if not math.isfinite(n) or n < 0:
        raise TypeError(f"{label} must be a non-negative finite number")
    return n


def _explicit_single_answer_policy(policy: Any) -> bool:
    if not isinstance(policy, Mapping):
        return False
    side_effect = _maybe(policy, "side_effect_class", "sideEffectClass")
    if side_effect not in ("read_only", "idempotent_read"):
        return False
    if _maybe(policy, "exact_single_answer_shareable", "exactSingleAnswerShareable") is not True:
        return False
    if _maybe(policy, "independent_samples_required", "independentSamplesRequired") is True:
        return False
    return True


def _native_zero_cost_dominates(policy: Mapping[str, Any]) -> bool:
    native = _maybe(policy, "native_control", "nativeControl", {})
    if not isinstance(native, Mapping):
        return False
    return (
        _maybe(native, "exact_response_cache", "exactResponseCache") is True
        and _maybe(native, "cache_hit_marginal_cost_zero", "cacheHitMarginalCostZero") is True
    )


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _scope_hash(scope_key: str) -> str:
    if not isinstance(scope_key, str) or len(scope_key) < 8:
        raise TypeError("scope_key must be an opaque fleet/tenant scope string of at least 8 characters")
    return sha256_json_fingerprint({"scope": scope_key})


def _cost_field(cost: Mapping[str, Any], snake: str, camel: str, default: Any = None) -> Any:
    return _maybe(cost, snake, camel, default)


def _normalize_cost(cost: Any) -> Optional[dict[str, Any]]:
    if cost is None:
        return None
    if isinstance(cost, bool):
        raise TypeError("cost must be a number or mapping")
    if isinstance(cost, (int, float)):
        return {
            "marginal_cost_usd": _non_negative_finite(cost, "cost"),
            "provenance": "caller_estimate",
            "resolver": None,
        }
    if not isinstance(cost, Mapping):
        raise TypeError("cost must be a number or mapping")
    resolver = _cost_field(cost, "resolve_marginal_cost_usd", "resolveMarginalCostUsd")
    if resolver is not None and not callable(resolver):
        raise TypeError("cost resolver must be callable")
    marginal = _non_negative_finite(
        _cost_field(cost, "marginal_cost_usd", "marginalCostUsd"),
        "cost.marginal_cost_usd",
    )
    if marginal is None and resolver is None:
        raise TypeError("cost requires marginal_cost_usd or a resolver")
    provenance = cost.get("provenance")
    if not isinstance(provenance, str) or not provenance.strip():
        provenance = "caller_estimate"
    return {
        "marginal_cost_usd": marginal,
        "provenance": provenance.strip(),
        "resolver": resolver,
    }


async def _resolve_cost(cost_input: Optional[Mapping[str, Any]], value: Any) -> dict[str, Any]:
    if cost_input is None:
        return {"marginal_cost_usd": None, "provenance": None, "cost_resolution": "not_provided"}
    resolver = cost_input.get("resolver")
    if resolver is not None:
        try:
            resolved = _non_negative_finite(await _maybe_await(resolver(value)), "cost resolver result")
            return {
                "marginal_cost_usd": resolved,
                "provenance": cost_input.get("provenance"),
                "cost_resolution": "unknown" if resolved is None else "resolved",
            }
        except Exception:
            return {
                "marginal_cost_usd": None,
                "provenance": cost_input.get("provenance"),
                "cost_resolution": "resolver_failed",
            }
    marginal = cost_input.get("marginal_cost_usd")
    return {
        "marginal_cost_usd": marginal,
        "provenance": cost_input.get("provenance"),
        "cost_resolution": "unknown" if marginal is None else "fixed",
    }


class InMemoryFleetShadowStore:
    """Process-local test/development store. Use a caller-owned shared store across workers."""

    def __init__(self, *, now: Optional[Callable[[], float]] = None) -> None:
        self._now = now or (lambda: time.time() * 1000.0)
        self._locks: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _key(scope_hash: str, coordinate_key: str) -> str:
        return f"{scope_hash}|{coordinate_key}"

    async def try_claim(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        owner_id: str,
        lease_ms: float,
    ) -> Mapping[str, Any]:
        key = self._key(scope_hash, coordinate_key)
        now_ms = float(self._now())
        current = self._locks.get(key)
        if (
            current is None
            or current["expires_at_ms"] <= now_ms
            or current["status"] in ("completed", "failed")
        ):
            generation = str(uuid.uuid4())
            expires_at_ms = now_ms + lease_ms
            self._locks[key] = {
                "status": "pending",
                "generation": generation,
                "owner_id": owner_id,
                "expires_at_ms": expires_at_ms,
            }
            return {"role": "leader", "generation": generation, "expires_at_ms": expires_at_ms}
        return {
            "role": "follower",
            "generation": current["generation"],
            "expires_at_ms": current["expires_at_ms"],
        }

    async def fail(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        generation: str,
        owner_id: str,
        **_: Any,
    ) -> bool:
        key = self._key(scope_hash, coordinate_key)
        current = self._locks.get(key)
        if (
            current is None
            or current["status"] != "pending"
            or current["generation"] != generation
            or current["owner_id"] != owner_id
        ):
            return False
        self._locks[key] = {
            **current,
            "status": "failed",
            "expires_at_ms": float(self._now()),
        }
        return True


class SeenRelayFleetShadowMeter:
    """Measure exact compatible in-flight overlap while executing every call."""

    def __init__(
        self,
        *,
        store: Any,
        scope_key: str,
        owner_id: Optional[str] = None,
        lease_ms: float = 60_000,
    ) -> None:
        if not callable(getattr(store, "try_claim", None)) or not callable(getattr(store, "fail", None)):
            raise TypeError("store must provide try_claim() and fail()")
        self.scope_hash = _scope_hash(scope_key)
        self.store = store
        self.owner_id = owner_id or str(uuid.uuid4())
        self.lease_ms = _positive_finite(lease_ms, 60_000, "lease_ms")
        self._metrics: dict[str, Any] = {
            "calls": 0,
            "eligibleCalls": 0,
            "policyIneligibleCalls": 0,
            "nativeControlDominatedCalls": 0,
            "shadowLeaderStarts": 0,
            "callsWithIdenticalInflightPredecessor": 0,
            "unclassifiedEligibleCalls": 0,
            "authoritativeExecutions": 0,
            "successfulExecutions": 0,
            "failedExecutions": 0,
            "storeFailures": 0,
            "coordinateFailures": 0,
            "leaseReleaseMisses": 0,
            "costResolutionFailures": 0,
            "costedExecutions": 0,
            "uncostedExecutions": 0,
            "observedCostUsd": 0.0,
            "overlappedFollowerCostedExecutions": 0,
            "overlappedFollowerObservedCostUsd": 0.0,
            "costProvenance": {},
        }

    def get_report(self) -> Mapping[str, Any]:
        classified = (
            self._metrics["shadowLeaderStarts"]
            + self._metrics["callsWithIdenticalInflightPredecessor"]
        )
        return {
            "schema": "seenrelay-fleet-shadow-overlap-report-v0",
            "mode": "shadow",
            "authoritativeSuppressionEnabled": False,
            "calls": self._metrics["calls"],
            "eligibleCalls": self._metrics["eligibleCalls"],
            "policyIneligibleCalls": self._metrics["policyIneligibleCalls"],
            "nativeControlDominatedCalls": self._metrics["nativeControlDominatedCalls"],
            "classifiedEligibleCalls": classified,
            "unclassifiedEligibleCalls": self._metrics["unclassifiedEligibleCalls"],
            "shadowLeaderStarts": self._metrics["shadowLeaderStarts"],
            "callsWithIdenticalInflightPredecessor": self._metrics[
                "callsWithIdenticalInflightPredecessor"
            ],
            "classifiedOverlapStartFraction": (
                self._metrics["callsWithIdenticalInflightPredecessor"] / classified
                if classified > 0
                else None
            ),
            "authoritativeExecutions": self._metrics["authoritativeExecutions"],
            "successfulExecutions": self._metrics["successfulExecutions"],
            "failedExecutions": self._metrics["failedExecutions"],
            "storeFailures": self._metrics["storeFailures"],
            "coordinateFailures": self._metrics["coordinateFailures"],
            "leaseReleaseMisses": self._metrics["leaseReleaseMisses"],
            "costResolutionFailures": self._metrics["costResolutionFailures"],
            "costedExecutions": self._metrics["costedExecutions"],
            "uncostedExecutions": self._metrics["uncostedExecutions"],
            "observedCostUsd": self._metrics["observedCostUsd"],
            "overlappedFollowerCostedExecutions": self._metrics[
                "overlappedFollowerCostedExecutions"
            ],
            "overlappedFollowerObservedCostUsd": self._metrics[
                "overlappedFollowerObservedCostUsd"
            ],
            "costProvenance": dict(self._metrics["costProvenance"]),
        }

    async def measure(
        self,
        *,
        coordinate: Any,
        policy: Mapping[str, Any],
        execute: Callable[[], Any],
        cost: Any = None,
    ) -> Any:
        if not callable(execute):
            raise TypeError("execute must be callable")

        self._metrics["calls"] += 1
        self._metrics["authoritativeExecutions"] += 1

        claim: Optional[Mapping[str, Any]] = None
        coordinate_key: Optional[str] = None
        overlapped_follower = False

        if not _explicit_single_answer_policy(policy):
            self._metrics["policyIneligibleCalls"] += 1
        elif _native_zero_cost_dominates(policy):
            self._metrics["nativeControlDominatedCalls"] += 1
        else:
            self._metrics["eligibleCalls"] += 1
            try:
                coordinate_key = sha256_json_fingerprint(
                    {"fleetShadowCoordinateV0": coordinate}
                )
            except Exception:
                self._metrics["coordinateFailures"] += 1
                self._metrics["unclassifiedEligibleCalls"] += 1

            if coordinate_key is not None:
                try:
                    claim = await _maybe_await(
                        self.store.try_claim(
                            scope_hash=self.scope_hash,
                            coordinate_key=coordinate_key,
                            owner_id=self.owner_id,
                            lease_ms=self.lease_ms,
                        )
                    )
                    if not isinstance(claim, Mapping) or claim.get("role") not in ("leader", "follower"):
                        raise RuntimeError("store returned an invalid claim")
                    if claim["role"] == "leader":
                        self._metrics["shadowLeaderStarts"] += 1
                    else:
                        overlapped_follower = True
                        self._metrics["callsWithIdenticalInflightPredecessor"] += 1
                except Exception:
                    claim = None
                    self._metrics["storeFailures"] += 1
                    self._metrics["unclassifiedEligibleCalls"] += 1

        try:
            value = await _maybe_await(execute())
            self._metrics["successfulExecutions"] += 1
        except Exception:
            self._metrics["failedExecutions"] += 1
            raise
        finally:
            if claim is not None and claim.get("role") == "leader" and coordinate_key is not None:
                try:
                    released = await _maybe_await(
                        self.store.fail(
                            scope_hash=self.scope_hash,
                            coordinate_key=coordinate_key,
                            generation=claim.get("generation"),
                            owner_id=self.owner_id,
                            pending_token=claim.get("pending_token"),
                        )
                    )
                    if not released:
                        self._metrics["leaseReleaseMisses"] += 1
                except Exception:
                    self._metrics["storeFailures"] += 1

        try:
            cost_input = _normalize_cost(cost)
        except Exception:
            cost_input = None
            self._metrics["costResolutionFailures"] += 1

        resolved = await _resolve_cost(cost_input, value)
        if resolved["cost_resolution"] == "resolver_failed":
            self._metrics["costResolutionFailures"] += 1

        marginal = resolved["marginal_cost_usd"]
        if marginal is None:
            self._metrics["uncostedExecutions"] += 1
        else:
            self._metrics["costedExecutions"] += 1
            self._metrics["observedCostUsd"] += marginal
            provenance = resolved["provenance"]
            if provenance:
                provenance_counts = self._metrics["costProvenance"]
                provenance_counts[provenance] = provenance_counts.get(provenance, 0) + 1
            if overlapped_follower:
                self._metrics["overlappedFollowerCostedExecutions"] += 1
                self._metrics["overlappedFollowerObservedCostUsd"] += marginal

        return value


def wrap_fleet_shadow_call(
    meter: SeenRelayFleetShadowMeter,
    fn: Callable[..., Any],
    *,
    policy: Mapping[str, Any],
    coordinate_from_args: Optional[Callable[..., Any]] = None,
    cost: Any = None,
) -> Callable[..., Any]:
    """Wrap one reviewed call; the returned wrapper is async and never suppresses the original function."""
    if not callable(getattr(meter, "measure", None)):
        raise TypeError("meter must provide measure()")
    if not callable(fn):
        raise TypeError("fn must be callable")
    if not isinstance(policy, Mapping):
        raise TypeError("policy is required")
    if coordinate_from_args is not None and not callable(coordinate_from_args):
        raise TypeError("coordinate_from_args must be callable")

    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        if coordinate_from_args is not None:
            try:
                coordinate = coordinate_from_args(*args, **kwargs)
            except Exception:
                coordinate = object()
        else:
            coordinate = {"args": list(args), "kwargs": dict(kwargs)}
        return await meter.measure(
            coordinate=coordinate,
            policy=policy,
            execute=lambda: fn(*args, **kwargs),
            cost=cost,
        )

    return wrapped
