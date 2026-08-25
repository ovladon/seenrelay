from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import json
import threading
import time
import uuid
from typing import Any, Callable, Generic, Mapping, MutableMapping, Optional, TypeVar
from urllib import request as urllib_request
from urllib.error import HTTPError

T = TypeVar("T")
JsonValue = Any

@dataclass(frozen=True)
class TransportResponse:
    status: int
    headers: Mapping[str, str]
    body: Any

@dataclass(frozen=True)
class ValidationContext:
    check: Optional[Mapping[str, Any]]
    conditional_headers: Mapping[str, str]

@dataclass(frozen=True)
class ReuseDecision(Generic[T]):
    reuse: bool
    value: Optional[T] = None

@dataclass(frozen=True)
class GuardDetailedResult(Generic[T]):
    value: T
    path: str
    check: Optional[Mapping[str, Any]]
    check_ok: bool
    observe_ok: Optional[bool]
    check_error: Optional[str] = None
    observe_error: Optional[str] = None

@dataclass(frozen=True)
class TelemetrySnapshot:
    guard_calls: int
    check_calls: int
    check_successes: int
    check_failures: int
    check_timeouts: int
    check_network_requests: int
    check_coalesced: int
    check_network_latency_ms_total: float
    check_network_latency_ms_max: float
    check_network_latency_ms_average: float
    reuse_hits: int
    validation_calls: int
    conditional_hint_validations: int
    observe_attempts: int
    observe_successes: int
    observe_failures: int
    observe_timeouts: int
    observe_network_requests: int
    observe_network_latency_ms_total: float
    observe_network_latency_ms_max: float
    observe_network_latency_ms_average: float

@dataclass(frozen=True)
class ReuseEconomicsEstimate:
    gross_avoided_validation_cost: float
    relay_request_cost: float
    net_estimated_savings: float
    excludes_conditional_request_savings: bool = True

Transport = Callable[[str, str, Mapping[str, str], Any, float], TransportResponse]
ReusePolicy = Callable[[Mapping[str, Any], T], ReuseDecision[T]]
ValidatorMetadata = Mapping[str, Any]
ObservationFactory = Callable[[T, ValidationContext], Optional[ValidatorMetadata]]
Validator = Callable[[ValidationContext], T]

class _InflightCheck:
    __slots__ = ("event", "result", "error")
    def __init__(self) -> None:
        self.event = threading.Event()
        self.result: Optional[Mapping[str, Any]] = None
        self.error: Optional[Exception] = None

def _empty_metrics() -> MutableMapping[str, float | int]:
    return {
        "guard_calls": 0, "check_calls": 0, "check_successes": 0, "check_failures": 0,
        "check_timeouts": 0, "check_network_requests": 0, "check_coalesced": 0,
        "check_network_latency_ms_total": 0.0, "check_network_latency_ms_max": 0.0,
        "reuse_hits": 0, "validation_calls": 0, "conditional_hint_validations": 0,
        "observe_attempts": 0, "observe_successes": 0, "observe_failures": 0,
        "observe_timeouts": 0, "observe_network_requests": 0,
        "observe_network_latency_ms_total": 0.0, "observe_network_latency_ms_max": 0.0,
    }

def reuse_known_on_same_observed(check: Mapping[str, Any], known_value: T) -> ReuseDecision[T]:
    if check.get("status") == "SAME_OBSERVED":
        return ReuseDecision(reuse=True, value=known_value)
    return ReuseDecision(reuse=False)

def _default_transport(method: str, url: str, headers: Mapping[str, str], body: Any, timeout: float) -> TransportResponse:
    data = json.dumps(body, separators=(",", ":"), allow_nan=False).encode("utf-8")
    req = urllib_request.Request(url, data=data, method=method, headers=dict(headers))
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            parsed = json.loads(response.read().decode("utf-8"))
            return TransportResponse(status=response.status, headers={k.lower(): v for k, v in response.headers.items()}, body=parsed)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"error": raw}
        return TransportResponse(status=exc.code, headers={k.lower(): v for k, v in exc.headers.items()}, body=parsed)

def _safe_conditional_headers(check: Optional[Mapping[str, Any]]) -> Mapping[str, str]:
    if not check:
        return {}
    hint = check.get("conditional_request_hint")
    if not isinstance(hint, Mapping):
        return {}
    name = hint.get("request_header")
    value = hint.get("header_value")
    if name not in {"If-None-Match", "If-Modified-Since"}:
        return {}
    if not isinstance(value, str) or not value or "\r" in value or "\n" in value:
        return {}
    return {str(name): value}

def _positive_finite(value: float, name: str) -> float:
    number = float(value)
    if not (number > 0.0 and number < float("inf")):
        raise ValueError(f"{name} must be a positive finite number")
    return number

def _non_negative_finite(value: float, name: str) -> float:
    number = float(value)
    if not (number >= 0.0 and number < float("inf")):
        raise ValueError(f"{name} must be a non-negative finite number")
    return number

def _coalescing_key(fact: Mapping[str, Any], known_value: Any, max_age_seconds: Optional[int]) -> Optional[str]:
    payload: MutableMapping[str, Any] = {"fact": dict(fact), "known_value": known_value}
    if max_age_seconds is not None:
        payload["max_age_seconds"] = max_age_seconds
    try:
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError):
        return None

class SeenRelayClient:
    def __init__(self, *, base_url: str = "https://seenrelay.com", client_hint: Optional[str] = None,
                 initial_lease: Optional[str] = None, on_lease: Optional[Callable[[str], None]] = None,
                 check_timeout_seconds: float = 1.0, observe_timeout_seconds: float = 0.75,
                 coalesce_checks: bool = True, transport: Transport = _default_transport) -> None:
        self.base_url = base_url.rstrip("/")
        self.client_hint = client_hint.strip() if client_hint and client_hint.strip() else None
        self.lease = initial_lease.strip() if initial_lease and initial_lease.strip() else None
        self.on_lease = on_lease
        self.check_timeout_seconds = _positive_finite(check_timeout_seconds, "check_timeout_seconds")
        self.observe_timeout_seconds = _positive_finite(observe_timeout_seconds, "observe_timeout_seconds")
        self.coalesce_checks = bool(coalesce_checks)
        self.transport = transport
        self._state_lock = threading.Lock()
        self._inflight_checks: MutableMapping[str, _InflightCheck] = {}
        self._metrics: MutableMapping[str, float | int] = _empty_metrics()

    def _metric_add(self, name: str, amount: float | int = 1) -> None:
        with self._state_lock:
            self._metrics[name] = self._metrics[name] + amount

    def _metric_latency(self, prefix: str, elapsed_ms: float) -> None:
        with self._state_lock:
            total = f"{prefix}_latency_ms_total"
            maximum = f"{prefix}_latency_ms_max"
            self._metrics[total] = float(self._metrics[total]) + elapsed_ms
            self._metrics[maximum] = max(float(self._metrics[maximum]), elapsed_ms)

    def get_telemetry(self) -> TelemetrySnapshot:
        with self._state_lock:
            m = dict(self._metrics)
        check_requests = int(m["check_network_requests"])
        observe_requests = int(m["observe_network_requests"])
        return TelemetrySnapshot(
            guard_calls=int(m["guard_calls"]), check_calls=int(m["check_calls"]), check_successes=int(m["check_successes"]),
            check_failures=int(m["check_failures"]), check_timeouts=int(m["check_timeouts"]), check_network_requests=check_requests,
            check_coalesced=int(m["check_coalesced"]), check_network_latency_ms_total=float(m["check_network_latency_ms_total"]),
            check_network_latency_ms_max=float(m["check_network_latency_ms_max"]),
            check_network_latency_ms_average=(float(m["check_network_latency_ms_total"]) / check_requests if check_requests else 0.0),
            reuse_hits=int(m["reuse_hits"]), validation_calls=int(m["validation_calls"]),
            conditional_hint_validations=int(m["conditional_hint_validations"]), observe_attempts=int(m["observe_attempts"]),
            observe_successes=int(m["observe_successes"]), observe_failures=int(m["observe_failures"]),
            observe_timeouts=int(m["observe_timeouts"]), observe_network_requests=observe_requests,
            observe_network_latency_ms_total=float(m["observe_network_latency_ms_total"]),
            observe_network_latency_ms_max=float(m["observe_network_latency_ms_max"]),
            observe_network_latency_ms_average=(float(m["observe_network_latency_ms_total"]) / observe_requests if observe_requests else 0.0),
        )

    def reset_telemetry(self) -> None:
        with self._state_lock:
            self._metrics = _empty_metrics()

    def estimate_reuse_economics(self, *, avoided_validation_cost: float, check_request_cost: float = 0.0,
                                 observe_request_cost: float = 0.0) -> ReuseEconomicsEstimate:
        avoided = _positive_finite(avoided_validation_cost, "avoided_validation_cost")
        check_cost = _non_negative_finite(check_request_cost, "check_request_cost")
        observe_cost = _non_negative_finite(observe_request_cost, "observe_request_cost")
        m = self.get_telemetry()
        gross = m.reuse_hits * avoided
        relay = m.check_network_requests * check_cost + m.observe_network_requests * observe_cost
        return ReuseEconomicsEstimate(gross_avoided_validation_cost=gross, relay_request_cost=relay, net_estimated_savings=gross - relay)

    def guard(self, *, fact: Mapping[str, Any], known_value: T, validate: Validator[T], reuse: Optional[ReusePolicy[T]] = None,
              max_age_seconds: Optional[int] = None, observation: Optional[ObservationFactory[T]] = None) -> T:
        return self.guard_detailed(fact=fact, known_value=known_value, validate=validate, reuse=reuse,
                                   max_age_seconds=max_age_seconds, observation=observation).value

    def guard_detailed(self, *, fact: Mapping[str, Any], known_value: T, validate: Validator[T],
                       reuse: Optional[ReusePolicy[T]] = None, max_age_seconds: Optional[int] = None,
                       observation: Optional[ObservationFactory[T]] = None) -> GuardDetailedResult[T]:
        self._metric_add("guard_calls")
        self._metric_add("check_calls")
        check: Optional[Mapping[str, Any]] = None
        check_ok = False
        check_error: Optional[str] = None
        try:
            check = self._check(fact, known_value, max_age_seconds)
            check_ok = True
            self._metric_add("check_successes")
        except Exception as exc:
            self._metric_add("check_failures")
            if isinstance(exc, TimeoutError): self._metric_add("check_timeouts")
            check_error = str(exc)
        if check is not None and reuse is not None:
            decision = reuse(check, known_value)
            if decision.reuse:
                self._metric_add("reuse_hits")
                return GuardDetailedResult(value=decision.value, path="reused", check=check, check_ok=check_ok,
                                           observe_ok=None, check_error=check_error)  # type: ignore[arg-type]
        conditional_headers = _safe_conditional_headers(check)
        context = ValidationContext(check=check, conditional_headers=conditional_headers)
        self._metric_add("validation_calls")
        if conditional_headers: self._metric_add("conditional_hint_validations")
        value = validate(context)
        observe_ok: Optional[bool] = None
        observe_error: Optional[str] = None
        self._metric_add("observe_attempts")
        try:
            metadata = observation(value, context) if observation else None
            self._observe(fact, value, metadata)
            observe_ok = True
            self._metric_add("observe_successes")
        except Exception as exc:
            observe_ok = False
            self._metric_add("observe_failures")
            if isinstance(exc, TimeoutError): self._metric_add("observe_timeouts")
            observe_error = str(exc)
        return GuardDetailedResult(value=value, path="validated", check=check, check_ok=check_ok, observe_ok=observe_ok,
                                   check_error=check_error, observe_error=observe_error)

    def _headers(self) -> MutableMapping[str, str]:
        with self._state_lock:
            lease = self.lease
        headers: MutableMapping[str, str] = {"content-type": "application/json"}
        if lease: headers["x-seenrelay-lease"] = lease
        if self.client_hint: headers["x-seenrelay-client"] = self.client_hint
        return headers

    def _update_lease(self, response: TransportResponse) -> None:
        header_lease = response.headers.get("x-seenrelay-lease") or response.headers.get("X-SeenRelay-Lease")
        body_lease = None
        if isinstance(response.body, Mapping):
            hive = response.body.get("hive")
            if isinstance(hive, Mapping) and isinstance(hive.get("lease"), str): body_lease = hive.get("lease")
        next_lease = str(header_lease or body_lease or "").strip()
        if not next_lease: return
        callback: Optional[Callable[[str], None]] = None
        with self._state_lock:
            if next_lease == self.lease: return
            self.lease = next_lease
            callback = self.on_lease
        if callback: callback(next_lease)

    def _post(self, path: str, body: Any, timeout: float) -> Any:
        response = self.transport("POST", f"{self.base_url}{path}", self._headers(), body, timeout)
        self._update_lease(response)
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"SeenRelay {path} returned HTTP {response.status}")
        return response.body

    def _check(self, fact: Mapping[str, Any], known_value: T, max_age_seconds: Optional[int]) -> Mapping[str, Any]:
        key = _coalescing_key(fact, known_value, max_age_seconds) if self.coalesce_checks else None
        if key is None: return self._check_network(fact, known_value, max_age_seconds)
        with self._state_lock:
            inflight = self._inflight_checks.get(key)
            if inflight is None:
                inflight = _InflightCheck(); self._inflight_checks[key] = inflight; leader = True
            else:
                leader = False; self._metrics["check_coalesced"] = self._metrics["check_coalesced"] + 1
        if not leader:
            inflight.event.wait()
            if inflight.error is not None: raise RuntimeError(str(inflight.error)) from inflight.error
            if inflight.result is None: raise RuntimeError("coalesced SeenRelay CHECK completed without a result")
            return deepcopy(inflight.result)
        try:
            result = self._check_network(fact, known_value, max_age_seconds); inflight.result = result; return deepcopy(result)
        except Exception as exc:
            inflight.error = exc; raise
        finally:
            inflight.event.set()
            with self._state_lock:
                if self._inflight_checks.get(key) is inflight: del self._inflight_checks[key]

    def _check_network(self, fact: Mapping[str, Any], known_value: T, max_age_seconds: Optional[int]) -> Mapping[str, Any]:
        self._metric_add("check_network_requests")
        started = time.monotonic()
        try:
            payload: MutableMapping[str, Any] = {"fact": dict(fact), "known_value": known_value}
            if max_age_seconds is not None: payload["max_age_seconds"] = max_age_seconds
            body = self._post("/v1/check", payload, self.check_timeout_seconds)
            if not isinstance(body, Mapping): raise RuntimeError("SeenRelay CHECK response is not an object")
            if body.get("status") not in {"SAME_OBSERVED", "CHANGED_OBSERVED", "CONTESTED", "STALE", "UNKNOWN"}:
                raise RuntimeError("SeenRelay CHECK response has an invalid status")
            return body
        finally:
            self._metric_latency("check_network", max(0.0, (time.monotonic() - started) * 1000.0))

    def _observe(self, fact: Mapping[str, Any], value: T, metadata: Optional[Mapping[str, Any]]) -> None:
        meta = dict(metadata or {})
        source_validator = meta.pop("source_validator", None)
        if source_validator is not None:
            if not isinstance(source_validator, Mapping): raise ValueError("source_validator must be an object")
            validator_value = source_validator.get("value")
            if not isinstance(validator_value, str) or "\r" in validator_value or "\n" in validator_value:
                raise ValueError("source_validator.value must not contain CR or LF")
        payload: MutableMapping[str, Any] = {
            "fact": dict(fact), "value": value,
            "observed_at": meta.pop("observed_at", None) or __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "idempotency_key": meta.pop("idempotency_key", None) or str(uuid.uuid4()),
        }
        observer_id = meta.pop("observer_id", None)
        evidence_fingerprint = meta.pop("evidence_fingerprint", None)
        if observer_id: payload["observer_id"] = observer_id
        if evidence_fingerprint: payload["evidence_fingerprint"] = evidence_fingerprint
        if source_validator is not None: payload["source_validator"] = dict(source_validator)
        if meta: raise ValueError(f"unsupported observation metadata: {', '.join(sorted(meta))}")
        self._metric_add("observe_network_requests")
        started = time.monotonic()
        try:
            self._post("/v1/observe", payload, self.observe_timeout_seconds)
        finally:
            self._metric_latency("observe_network", max(0.0, (time.monotonic() - started) * 1000.0))
