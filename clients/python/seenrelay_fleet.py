"""Caller-scoped fleet-level exact in-flight coordination for Python.

This module does not call hosted SeenRelay operations. It coordinates only
explicitly eligible in-flight work through a caller-owned shared store, keeps
the original operation as the fail-open fallback, and can emit conservative
local savings receipts.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import math
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional

from seenrelay_zero_state import sha256_json_fingerprint


def _now_ms() -> float:
    return time.time() * 1000.0


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _mapping_value(value: Any, snake: str, camel: Optional[str] = None, default: Any = None) -> Any:
    if not isinstance(value, Mapping):
        return default
    if snake in value:
        return value[snake]
    if camel and camel in value:
        return value[camel]
    return default


def _positive(value: Any, fallback: float, name: str) -> float:
    raw = fallback if value is None else value
    try:
        number = float(raw)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{name} must be a positive finite number") from exc
    if not math.isfinite(number) or number <= 0:
        raise TypeError(f"{name} must be a positive finite number")
    return number


def _optional_non_negative(value: Any, name: str) -> Optional[float]:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{name} must be a non-negative finite number") from exc
    if not math.isfinite(number) or number < 0:
        raise TypeError(f"{name} must be a non-negative finite number")
    return number


def _scope_hash(scope_key: str) -> str:
    if not isinstance(scope_key, str) or len(scope_key) < 8:
        raise TypeError("scope_key must be an opaque fleet/tenant scope string of at least 8 characters")
    return sha256_json_fingerprint({"scope": scope_key})


def _shareable(policy: Any) -> bool:
    side_effect = _mapping_value(policy, "side_effect_class", "sideEffectClass")
    if side_effect not in ("read_only", "idempotent_read"):
        return False
    if _mapping_value(policy, "exact_single_answer_shareable", "exactSingleAnswerShareable") is not True:
        return False
    if _mapping_value(policy, "independent_samples_required", "independentSamplesRequired") is True:
        return False
    return True


def _native_zero_cost_dominates(policy: Any) -> bool:
    native = _mapping_value(policy, "native_control", "nativeControl")
    return (
        _mapping_value(native, "exact_response_cache", "exactResponseCache") is True
        and _mapping_value(native, "cache_hit_marginal_cost_zero", "cacheHitMarginalCostZero") is True
    )


def _aad_key(scope_hash: str, coordinate_key: str, generation: str) -> str:
    fingerprint = sha256_json_fingerprint({
        "scopeHash": scope_hash,
        "coordinateKey": coordinate_key,
        "generation": generation,
    })
    return f"seenrelay-fleet-v0:{fingerprint}"


def _sealed_size(value: Any) -> int:
    if isinstance(value, str):
        return len(value.encode("utf-8"))
    if isinstance(value, (bytes, bytearray, memoryview)):
        return len(value)
    raise TypeError("fleet codec seal() must return a string or bytes-like value")


class _FleetCodecAdapter:
    def __init__(self, private_codec: Any) -> None:
        if not callable(getattr(private_codec, "seal", None)) or not callable(getattr(private_codec, "open", None)):
            raise TypeError("private_codec must provide seal() and open()")
        self._codec = private_codec

    async def seal(self, value: Any, context: Mapping[str, str]) -> Any:
        aad = _aad_key(context["scope_hash"], context["coordinate_key"], context["generation"])
        return await _maybe_await(self._codec.seal(value, aad))

    async def open(self, sealed: Any, context: Mapping[str, str]) -> Any:
        aad = _aad_key(context["scope_hash"], context["coordinate_key"], context["generation"])
        return await _maybe_await(self._codec.open(sealed, aad))


def fleet_codec_from_private_codec(private_codec: Any) -> Any:
    """Adapt the existing caller-owned private codec for fleet result sealing."""
    return _FleetCodecAdapter(private_codec)


class InMemoryFleetCoordinationStore:
    """Test/local store. Separate processes require a real shared store."""

    def __init__(self, *, now: Callable[[], float] = _now_ms) -> None:
        if not callable(now):
            raise TypeError("now must be callable")
        self._now = now
        self._locks: dict[str, dict[str, Any]] = {}
        self._results: dict[str, Any] = {}
        self._mutex = asyncio.Lock()

    @staticmethod
    def _key(scope_hash: str, coordinate_key: str) -> str:
        return f"{scope_hash}|{coordinate_key}"

    @staticmethod
    def _result_key(scope_hash: str, coordinate_key: str, generation: str) -> str:
        return f"{scope_hash}|{coordinate_key}|{generation}"

    async def try_claim(self, *, scope_hash: str, coordinate_key: str, owner_id: str, lease_ms: float) -> Mapping[str, Any]:
        async with self._mutex:
            key = self._key(scope_hash, coordinate_key)
            now = float(self._now())
            current = self._locks.get(key)
            if (
                current is None
                or float(current["expires_at_ms"]) <= now
                or current["status"] in ("completed", "failed")
            ):
                generation = str(uuid.uuid4())
                expires_at_ms = now + lease_ms
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

    async def read(self, *, scope_hash: str, coordinate_key: str, generation: str, pending_token: Any = None) -> Mapping[str, Any]:
        del pending_token
        async with self._mutex:
            result_key = self._result_key(scope_hash, coordinate_key, generation)
            if result_key in self._results:
                return {"status": "completed", "sealed_result": self._results[result_key]}
            row = self._locks.get(self._key(scope_hash, coordinate_key))
            if row is None or row["generation"] != generation:
                return {"status": "missing"}
            if row["status"] == "failed":
                return {"status": "failed"}
            if row["status"] == "completed":
                return {"status": "missing"}
            if float(row["expires_at_ms"]) <= float(self._now()):
                return {"status": "missing"}
            return {"status": "pending", "expires_at_ms": row["expires_at_ms"]}

    async def publish(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        generation: str,
        owner_id: str,
        sealed_result: Any,
        pending_token: Any = None,
    ) -> bool:
        del pending_token
        async with self._mutex:
            key = self._key(scope_hash, coordinate_key)
            row = self._locks.get(key)
            if (
                row is None
                or row["status"] != "pending"
                or row["generation"] != generation
                or row["owner_id"] != owner_id
            ):
                return False
            self._results[self._result_key(scope_hash, coordinate_key, generation)] = sealed_result
            self._locks[key] = {**row, "status": "completed"}
            return True

    async def fail(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        generation: str,
        owner_id: str,
        pending_token: Any = None,
    ) -> bool:
        del pending_token
        async with self._mutex:
            key = self._key(scope_hash, coordinate_key)
            row = self._locks.get(key)
            if (
                row is None
                or row["status"] != "pending"
                or row["generation"] != generation
                or row["owner_id"] != owner_id
            ):
                return False
            self._locks[key] = {**row, "status": "failed", "expires_at_ms": float(self._now())}
            return True


_CLAIM_LUA = """
local current = redis.call('GET', KEYS[1])
if (not current) or string.sub(current,1,2) == 'C|' or string.sub(current,1,2) == 'F|' then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return {1, ARGV[1]}
end
return {0, current}
"""

_PUBLISH_LUA = """
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[4], 'PX', ARGV[5])
return 1
"""

_FAIL_LUA = """
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
"""


def _token_parts(token: Any) -> Optional[dict[str, Any]]:
    if not isinstance(token, str):
        return None
    parts = token.split("|")
    if len(parts) != 4:
        return None
    try:
        expires = float(parts[3])
    except ValueError:
        return None
    if not math.isfinite(expires):
        return None
    return {
        "state": parts[0],
        "generation": parts[1],
        "owner_id": parts[2],
        "expires_at_ms": expires,
    }


class RedisRestFleetStore:
    """Dependency-free Redis REST adapter using atomic Lua claim/publish/fail."""

    def __init__(
        self,
        *,
        url: str,
        token: str,
        prefix: str = "seenrelay:fleet:v0",
        result_ttl_ms: float = 60_000,
        completion_grace_ms: float = 500,
        failure_grace_ms: float = 250,
        now: Callable[[], float] = _now_ms,
        timeout_seconds: float = 10.0,
        opener: Optional[Callable[[urllib.request.Request, float], Any]] = None,
    ) -> None:
        if not isinstance(url, str) or not url.rstrip("/"):
            raise TypeError("Redis REST url is required")
        if not isinstance(token, str) or not token:
            raise TypeError("Redis REST token is required")
        if not callable(now):
            raise TypeError("now must be callable")
        self.url = url.rstrip("/")
        self.token = token
        self.prefix = prefix
        self.result_ttl_ms = _positive(result_ttl_ms, 60_000, "result_ttl_ms")
        self.completion_grace_ms = _positive(completion_grace_ms, 500, "completion_grace_ms")
        self.failure_grace_ms = _positive(failure_grace_ms, 250, "failure_grace_ms")
        self.timeout_seconds = _positive(timeout_seconds, 10.0, "timeout_seconds")
        self._now = now
        self._opener = opener

    def _keys(self, scope_hash: str, coordinate_key: str, generation: Optional[str] = None) -> tuple[str, Optional[str]]:
        base = f"{self.prefix}:{scope_hash}:{coordinate_key}"
        return f"{base}:lock", f"{base}:result:{generation}" if generation else None

    def _sync_command(self, args: list[Any]) -> Any:
        body = json.dumps(args, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        try:
            if self._opener is not None:
                response = self._opener(request, self.timeout_seconds)
            else:
                response = urllib.request.urlopen(request, timeout=self.timeout_seconds)
            with response:
                status = int(getattr(response, "status", 200))
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Redis REST HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("Redis REST request failed") from exc
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Redis REST returned non-JSON HTTP {status}") from exc
        if status < 200 or status >= 300:
            raise RuntimeError(f"Redis REST HTTP {status}")
        if isinstance(payload, Mapping) and payload.get("error"):
            raise RuntimeError(f"Redis REST error: {payload['error']}")
        return payload.get("result") if isinstance(payload, Mapping) else None

    async def _command(self, args: list[Any]) -> Any:
        return await asyncio.to_thread(self._sync_command, args)

    async def try_claim(self, *, scope_hash: str, coordinate_key: str, owner_id: str, lease_ms: float) -> Mapping[str, Any]:
        generation = str(uuid.uuid4())
        expires_at_ms = float(self._now()) + lease_ms
        pending_token = f"P|{generation}|{owner_id}|{expires_at_ms}"
        lock, _ = self._keys(scope_hash, coordinate_key)
        result = await self._command([
            "EVAL", _CLAIM_LUA, "1", lock, pending_token, str(math.ceil(lease_ms))
        ])
        if not isinstance(result, list) or len(result) < 2:
            raise RuntimeError("Redis REST claim returned an invalid response")
        if int(result[0]) == 1:
            return {
                "role": "leader",
                "generation": generation,
                "expires_at_ms": expires_at_ms,
                "pending_token": pending_token,
            }
        existing = _token_parts(result[1])
        if existing is None or existing["state"] != "P":
            raise RuntimeError("Redis REST claim returned an invalid pending token")
        return {
            "role": "follower",
            "generation": existing["generation"],
            "expires_at_ms": existing["expires_at_ms"],
            "pending_token": result[1],
        }

    async def read(self, *, scope_hash: str, coordinate_key: str, generation: str, pending_token: Any = None) -> Mapping[str, Any]:
        lock, result_key = self._keys(scope_hash, coordinate_key, generation)
        sealed = await self._command(["GET", result_key])
        if sealed is not None:
            return {"status": "completed", "sealed_result": sealed}
        current = await self._command(["GET", lock])
        if current == pending_token:
            parsed = _token_parts(current)
            if parsed is not None and parsed["expires_at_ms"] > float(self._now()):
                return {"status": "pending", "expires_at_ms": parsed["expires_at_ms"]}
        parsed = _token_parts(current)
        if parsed is not None and parsed["generation"] == generation and parsed["state"] == "C":
            # Publication can finish atomically between GET(result) and GET(lock).
            sealed = await self._command(["GET", result_key])
            if sealed is not None:
                return {"status": "completed", "sealed_result": sealed}
            return {"status": "missing"}
        if parsed is not None and parsed["generation"] == generation and parsed["state"] == "F":
            return {"status": "failed"}
        return {"status": "missing"}

    async def publish(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        generation: str,
        owner_id: str,
        sealed_result: Any,
        pending_token: Any = None,
    ) -> bool:
        if not isinstance(sealed_result, str):
            raise TypeError("Redis REST fleet store requires codec seal() to return a string")
        lock, result_key = self._keys(scope_hash, coordinate_key, generation)
        completed = f"C|{generation}|{owner_id}|{float(self._now()) + self.completion_grace_ms}"
        value = await self._command([
            "EVAL", _PUBLISH_LUA, "2", lock, result_key, pending_token, sealed_result,
            str(math.ceil(self.result_ttl_ms)), completed, str(math.ceil(self.completion_grace_ms)),
        ])
        return int(value) == 1

    async def fail(
        self,
        *,
        scope_hash: str,
        coordinate_key: str,
        generation: str,
        owner_id: str,
        pending_token: Any = None,
    ) -> bool:
        lock, _ = self._keys(scope_hash, coordinate_key, generation)
        failed = f"F|{generation}|{owner_id}|{float(self._now()) + self.failure_grace_ms}"
        value = await self._command([
            "EVAL", _FAIL_LUA, "1", lock, pending_token, failed, str(math.ceil(self.failure_grace_ms))
        ])
        return int(value) == 1


def create_redis_rest_fleet_store(**options: Any) -> RedisRestFleetStore:
    return RedisRestFleetStore(**options)


def _normalize_cost(cost: Any) -> Optional[dict[str, Any]]:
    if cost is None:
        return None
    if isinstance(cost, (int, float)) and not isinstance(cost, bool):
        return {
            "marginal_cost_usd": _optional_non_negative(cost, "cost"),
            "provenance": "caller_estimate",
            "resolver": None,
        }
    if not isinstance(cost, Mapping):
        raise TypeError("cost must be a number or mapping")
    resolver = _mapping_value(cost, "resolve_marginal_cost_usd", "resolveMarginalCostUsd")
    if resolver is not None and not callable(resolver):
        raise TypeError("cost resolver must be callable")
    marginal = _optional_non_negative(
        _mapping_value(cost, "marginal_cost_usd", "marginalCostUsd"),
        "cost.marginal_cost_usd",
    )
    if marginal is None and resolver is None:
        raise TypeError("cost requires marginal_cost_usd or resolve_marginal_cost_usd")
    provenance = _mapping_value(cost, "provenance", default="caller_estimate")
    if not isinstance(provenance, str) or not provenance.strip():
        provenance = "caller_estimate"
    return {"marginal_cost_usd": marginal, "provenance": provenance.strip(), "resolver": resolver}


async def _resolve_cost(cost_input: Optional[Mapping[str, Any]], value: Any) -> Mapping[str, Any]:
    if cost_input is None:
        return {"marginal_cost_usd": None, "provenance": None, "cost_resolution": "not_provided"}
    resolver = cost_input.get("resolver")
    if resolver is not None:
        try:
            resolved = _optional_non_negative(
                await _maybe_await(resolver(value)),
                "cost resolver result",
            )
            return {
                "marginal_cost_usd": resolved,
                "provenance": cost_input["provenance"],
                "cost_resolution": "unknown" if resolved is None else "resolved",
            }
        except Exception:
            return {
                "marginal_cost_usd": None,
                "provenance": cost_input["provenance"],
                "cost_resolution": "resolver_failed",
            }
    return {
        "marginal_cost_usd": cost_input.get("marginal_cost_usd"),
        "provenance": cost_input["provenance"],
        "cost_resolution": "unknown" if cost_input.get("marginal_cost_usd") is None else "fixed",
    }


def _receipt(
    *,
    coordinate_key: Optional[str],
    path: str,
    role: str,
    executed_authoritative: bool,
    reused_follower: bool,
    marginal_cost_usd: Optional[float],
    provenance: Optional[str],
    cost_resolution: str,
) -> Mapping[str, Any]:
    avoided = 1 if reused_follower else 0
    gross = marginal_cost_usd if avoided and marginal_cost_usd is not None else None
    return {
        "schema": "seenrelay-fleet-savings-receipt-v0",
        "coordinate_hash": coordinate_key,
        "path": path,
        "role": role,
        "executed_authoritative": bool(executed_authoritative),
        "reused_follower": bool(reused_follower),
        "avoided_executions": avoided,
        "marginal_cost_usd": marginal_cost_usd,
        "cost_provenance": provenance,
        "cost_resolution": cost_resolution,
        "gross_avoided_cost_usd": gross,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


class FleetSavingsLedger:
    def __init__(self) -> None:
        self._state: dict[str, Any] = {
            "receipts": 0,
            "authoritative_executions": 0,
            "follower_reuses": 0,
            "avoided_executions": 0,
            "gross_avoided_cost_usd": 0.0,
            "costed_avoided_executions": 0,
            "uncosted_avoided_executions": 0,
            "receipt_paths": Counter(),
            "cost_provenance": Counter(),
        }

    def record(self, receipt: Mapping[str, Any]) -> None:
        if not isinstance(receipt, Mapping) or receipt.get("schema") != "seenrelay-fleet-savings-receipt-v0":
            raise TypeError("record() requires a SeenRelay fleet savings receipt")
        self._state["receipts"] += 1
        if receipt.get("executed_authoritative"):
            self._state["authoritative_executions"] += 1
        if receipt.get("reused_follower"):
            self._state["follower_reuses"] += 1
        avoided = int(receipt.get("avoided_executions") or 0)
        self._state["avoided_executions"] += avoided
        self._state["receipt_paths"][str(receipt.get("path"))] += 1
        provenance = receipt.get("cost_provenance")
        if provenance:
            self._state["cost_provenance"][str(provenance)] += 1
        if avoided > 0:
            gross = receipt.get("gross_avoided_cost_usd")
            if gross is None:
                self._state["uncosted_avoided_executions"] += avoided
            else:
                self._state["costed_avoided_executions"] += avoided
                self._state["gross_avoided_cost_usd"] += float(gross)

    def snapshot(self) -> Mapping[str, Any]:
        return {
            "schema": "seenrelay-fleet-savings-ledger-v0",
            "receipts": self._state["receipts"],
            "authoritative_executions": self._state["authoritative_executions"],
            "follower_reuses": self._state["follower_reuses"],
            "avoided_executions": self._state["avoided_executions"],
            "gross_avoided_cost_usd": self._state["gross_avoided_cost_usd"],
            "costed_avoided_executions": self._state["costed_avoided_executions"],
            "uncosted_avoided_executions": self._state["uncosted_avoided_executions"],
            "receipt_paths": dict(self._state["receipt_paths"]),
            "cost_provenance": dict(self._state["cost_provenance"]),
        }


def create_fleet_savings_ledger() -> FleetSavingsLedger:
    return FleetSavingsLedger()


def _telemetry() -> dict[str, Any]:
    return {
        "calls": 0,
        "policy_passthrough": 0,
        "native_control_passthrough": 0,
        "leader_claims": 0,
        "leader_executions": 0,
        "follower_joins": 0,
        "follower_reuses": 0,
        "fail_open_executions": 0,
        "store_failures": 0,
        "codec_failures": 0,
        "follower_timeouts": 0,
        "oversize_results": 0,
        "avoided_executions": 0,
        "gross_avoided_cost_usd": 0.0,
        "costed_avoided_executions": 0,
        "receipt_failures": 0,
    }


class SeenRelayFleetCoordinator:
    def __init__(
        self,
        *,
        store: Any,
        codec: Any,
        scope_key: str,
        owner_id: Optional[str] = None,
        lease_ms: float = 60_000,
        poll_ms: float = 25,
        max_wait_ms: Optional[float] = None,
        max_sealed_bytes: float = 262_144,
        now: Callable[[], float] = _now_ms,
    ) -> None:
        for name in ("try_claim", "read", "publish", "fail"):
            if not callable(getattr(store, name, None)):
                raise TypeError("store must provide try_claim(), read(), publish(), and fail()")
        if not callable(getattr(codec, "seal", None)) or not callable(getattr(codec, "open", None)):
            raise TypeError("codec must provide seal() and open()")
        if not callable(now):
            raise TypeError("now must be callable")
        self.store = store
        self.codec = codec
        self.scope_hash = _scope_hash(scope_key)
        self.owner_id = owner_id or str(uuid.uuid4())
        self.lease_ms = _positive(lease_ms, 60_000, "lease_ms")
        self.poll_ms = _positive(poll_ms, 25, "poll_ms")
        self.max_wait_ms = _positive(max_wait_ms, self.lease_ms, "max_wait_ms")
        self.max_sealed_bytes = _positive(max_sealed_bytes, 262_144, "max_sealed_bytes")
        self._now = now
        self._metrics = _telemetry()

    def get_telemetry(self) -> Mapping[str, Any]:
        return dict(self._metrics)

    async def _emit_receipt(
        self,
        *,
        coordinate_key: Optional[str],
        path: str,
        role: str,
        executed_authoritative: bool,
        reused_follower: bool,
        value: Any,
        cost: Any,
        on_receipt: Optional[Callable[[Mapping[str, Any]], Any]],
    ) -> Mapping[str, Any]:
        try:
            cost_input = _normalize_cost(cost)
        except Exception:
            cost_input = None
            self._metrics["receipt_failures"] += 1
        resolved = await _resolve_cost(cost_input, value)
        receipt = _receipt(
            coordinate_key=coordinate_key,
            path=path,
            role=role,
            executed_authoritative=executed_authoritative,
            reused_follower=reused_follower,
            marginal_cost_usd=resolved["marginal_cost_usd"],
            provenance=resolved["provenance"],
            cost_resolution=resolved["cost_resolution"],
        )
        if receipt["avoided_executions"]:
            self._metrics["avoided_executions"] += receipt["avoided_executions"]
            if receipt["gross_avoided_cost_usd"] is not None:
                self._metrics["costed_avoided_executions"] += receipt["avoided_executions"]
                self._metrics["gross_avoided_cost_usd"] += float(receipt["gross_avoided_cost_usd"])
        if on_receipt is not None:
            try:
                await _maybe_await(on_receipt(receipt))
            except Exception:
                self._metrics["receipt_failures"] += 1
        return receipt

    async def _execute_with_receipt(
        self,
        *,
        execute: Callable[[], Any],
        coordinate_key: Optional[str],
        path: str,
        role: str,
        cost: Any,
        on_receipt: Optional[Callable[[Mapping[str, Any]], Any]],
    ) -> Any:
        value = await _maybe_await(execute())
        await self._emit_receipt(
            coordinate_key=coordinate_key,
            path=path,
            role=role,
            executed_authoritative=True,
            reused_follower=False,
            value=value,
            cost=cost,
            on_receipt=on_receipt,
        )
        return value

    async def run(
        self,
        *,
        coordinate: Any,
        policy: Mapping[str, Any],
        execute: Callable[[], Any],
        cost: Any = None,
        on_receipt: Optional[Callable[[Mapping[str, Any]], Any]] = None,
    ) -> Any:
        if not callable(execute):
            raise TypeError("execute must be callable")
        self._metrics["calls"] += 1

        if not _shareable(policy):
            self._metrics["policy_passthrough"] += 1
            return await self._execute_with_receipt(
                execute=execute, coordinate_key=None, path="policy_passthrough",
                role="passthrough", cost=cost, on_receipt=on_receipt,
            )
        if _native_zero_cost_dominates(policy):
            self._metrics["native_control_passthrough"] += 1
            return await self._execute_with_receipt(
                execute=execute, coordinate_key=None, path="native_control_passthrough",
                role="passthrough", cost=cost, on_receipt=on_receipt,
            )

        coordinate_key = sha256_json_fingerprint({"fleetCoordinateV0": coordinate})
        try:
            claim = await _maybe_await(self.store.try_claim(
                scope_hash=self.scope_hash,
                coordinate_key=coordinate_key,
                owner_id=self.owner_id,
                lease_ms=self.lease_ms,
            ))
        except Exception:
            self._metrics["store_failures"] += 1
            self._metrics["fail_open_executions"] += 1
            return await self._execute_with_receipt(
                execute=execute, coordinate_key=coordinate_key, path="fail_open_store_claim",
                role="fail_open", cost=cost, on_receipt=on_receipt,
            )

        if claim.get("role") == "leader":
            self._metrics["leader_claims"] += 1
            self._metrics["leader_executions"] += 1
            try:
                value = await _maybe_await(execute())
            except Exception:
                try:
                    await _maybe_await(self.store.fail(
                        scope_hash=self.scope_hash,
                        coordinate_key=coordinate_key,
                        generation=claim["generation"],
                        owner_id=self.owner_id,
                        pending_token=claim.get("pending_token"),
                    ))
                except Exception:
                    self._metrics["store_failures"] += 1
                raise

            context = {
                "scope_hash": self.scope_hash,
                "coordinate_key": coordinate_key,
                "generation": claim["generation"],
            }
            try:
                sealed = await _maybe_await(self.codec.seal(value, context))
            except Exception:
                self._metrics["codec_failures"] += 1
                try:
                    await _maybe_await(self.store.fail(
                        scope_hash=self.scope_hash,
                        coordinate_key=coordinate_key,
                        generation=claim["generation"],
                        owner_id=self.owner_id,
                        pending_token=claim.get("pending_token"),
                    ))
                except Exception:
                    self._metrics["store_failures"] += 1
                await self._emit_receipt(
                    coordinate_key=coordinate_key, path="leader_codec_fail_local_result", role="leader",
                    executed_authoritative=True, reused_follower=False, value=value, cost=cost, on_receipt=on_receipt,
                )
                return value

            if _sealed_size(sealed) > self.max_sealed_bytes:
                self._metrics["oversize_results"] += 1
                try:
                    await _maybe_await(self.store.fail(
                        scope_hash=self.scope_hash,
                        coordinate_key=coordinate_key,
                        generation=claim["generation"],
                        owner_id=self.owner_id,
                        pending_token=claim.get("pending_token"),
                    ))
                except Exception:
                    self._metrics["store_failures"] += 1
                await self._emit_receipt(
                    coordinate_key=coordinate_key, path="leader_oversize_local_result", role="leader",
                    executed_authoritative=True, reused_follower=False, value=value, cost=cost, on_receipt=on_receipt,
                )
                return value

            try:
                published = await _maybe_await(self.store.publish(
                    scope_hash=self.scope_hash,
                    coordinate_key=coordinate_key,
                    generation=claim["generation"],
                    owner_id=self.owner_id,
                    pending_token=claim.get("pending_token"),
                    sealed_result=sealed,
                ))
                if not published:
                    self._metrics["store_failures"] += 1
            except Exception:
                self._metrics["store_failures"] += 1

            await self._emit_receipt(
                coordinate_key=coordinate_key, path="leader_execution", role="leader",
                executed_authoritative=True, reused_follower=False, value=value, cost=cost, on_receipt=on_receipt,
            )
            return value

        self._metrics["follower_joins"] += 1
        started_at = float(self._now())
        context = {
            "scope_hash": self.scope_hash,
            "coordinate_key": coordinate_key,
            "generation": claim["generation"],
        }

        while float(self._now()) - started_at < self.max_wait_ms:
            try:
                state = await _maybe_await(self.store.read(
                    scope_hash=self.scope_hash,
                    coordinate_key=coordinate_key,
                    generation=claim["generation"],
                    pending_token=claim.get("pending_token"),
                ))
            except Exception:
                self._metrics["store_failures"] += 1
                self._metrics["fail_open_executions"] += 1
                return await self._execute_with_receipt(
                    execute=execute, coordinate_key=coordinate_key, path="fail_open_store_read",
                    role="fail_open", cost=cost, on_receipt=on_receipt,
                )

            if state and state.get("status") == "completed":
                try:
                    value = await _maybe_await(self.codec.open(state["sealed_result"], context))
                    self._metrics["follower_reuses"] += 1
                    await self._emit_receipt(
                        coordinate_key=coordinate_key, path="follower_reuse", role="follower",
                        executed_authoritative=False, reused_follower=True, value=value, cost=cost, on_receipt=on_receipt,
                    )
                    return value
                except Exception:
                    self._metrics["codec_failures"] += 1
                    self._metrics["fail_open_executions"] += 1
                    return await self._execute_with_receipt(
                        execute=execute, coordinate_key=coordinate_key, path="fail_open_codec",
                        role="fail_open", cost=cost, on_receipt=on_receipt,
                    )

            if not state or state.get("status") in ("failed", "missing"):
                self._metrics["fail_open_executions"] += 1
                return await self._execute_with_receipt(
                    execute=execute, coordinate_key=coordinate_key, path="fail_open_missing_generation",
                    role="fail_open", cost=cost, on_receipt=on_receipt,
                )

            if float(state.get("expires_at_ms", 0)) <= float(self._now()):
                self._metrics["follower_timeouts"] += 1
                self._metrics["fail_open_executions"] += 1
                return await self._execute_with_receipt(
                    execute=execute, coordinate_key=coordinate_key, path="fail_open_lease_expired",
                    role="fail_open", cost=cost, on_receipt=on_receipt,
                )

            await asyncio.sleep(self.poll_ms / 1000.0)

        self._metrics["follower_timeouts"] += 1
        self._metrics["fail_open_executions"] += 1
        return await self._execute_with_receipt(
            execute=execute, coordinate_key=coordinate_key, path="fail_open_wait_timeout",
            role="fail_open", cost=cost, on_receipt=on_receipt,
        )
