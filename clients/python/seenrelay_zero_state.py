"""Provider-independent local/private validation reuse for Python fleets.

This module never calls SeenRelay by itself. It keeps the caller's authoritative
read-only validator as the fallback and adds only in-flight, local, private-L1,
and source-native conditional reuse.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import inspect
import json
import math
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Optional

from seenrelay_ambient import fingerprint_jcs

_RESULT = "__seenrelay_zero_state_result_v1"


def _now_ms() -> float:
    return time.time() * 1000.0


def _non_negative(value: Any, name: str) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError) as exc:
        raise TypeError(f"{name} must be a non-negative finite number") from exc
    if not math.isfinite(n) or n < 0:
        raise TypeError(f"{name} must be a non-negative finite number")
    return n


def _positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise TypeError(f"{name} must be a positive integer")
    return value


def _reject_lossy_integers(value: Any, path: str = "coordinate", active: Optional[set[int]] = None) -> None:
    """Reject Python integers that would silently change when coerced to a JS Number."""
    if active is None:
        active = set()
    if isinstance(value, bool) or value is None or isinstance(value, (str, float)):
        return
    if isinstance(value, int):
        if abs(value) > 9007199254740991:
            try:
                as_float = float(value)
            except OverflowError as exc:
                raise TypeError(f"{path} integer is outside the JavaScript finite-number range") from exc
            if not math.isfinite(as_float) or int(as_float) != value:
                raise TypeError(f"{path} integer is not exactly representable as a JavaScript number")
        return
    if isinstance(value, list):
        oid = id(value)
        if oid in active:
            raise TypeError(f"{path} must not be cyclic")
        active.add(oid)
        try:
            for i, item in enumerate(value):
                _reject_lossy_integers(item, f"{path}[{i}]", active)
        finally:
            active.remove(oid)
        return
    if isinstance(value, Mapping):
        oid = id(value)
        if oid in active:
            raise TypeError(f"{path} must not be cyclic")
        active.add(oid)
        try:
            for key, item in value.items():
                if not isinstance(key, str):
                    raise TypeError(f"{path} keys must be strings")
                _reject_lossy_integers(item, f"{path}.{key}", active)
        finally:
            active.remove(oid)
        return
    raise TypeError(f"{path} must be JSON data")


def sha256_json_fingerprint(value: Any) -> str:
    _reject_lossy_integers(value)
    return fingerprint_jcs(value)


def _validator(value: Any) -> Optional[dict[str, str]]:
    if not isinstance(value, Mapping):
        return None
    etag = value.get("etag")
    modified = value.get("last_modified", value.get("lastModified"))
    out: dict[str, str] = {}
    if isinstance(etag, str) and etag and "\r" not in etag and "\n" not in etag:
        out["etag"] = etag
    if isinstance(modified, str) and modified and "\r" not in modified and "\n" not in modified:
        out["last_modified"] = modified
    return out or None


def _headers(value: Optional[Mapping[str, str]]) -> dict[str, str]:
    if not value:
        return {}
    if value.get("etag"):
        return {"If-None-Match": str(value["etag"])}
    if value.get("last_modified"):
        return {"If-Modified-Since": str(value["last_modified"])}
    return {}


def _observed_ms(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return _non_negative(value, "observed_at")
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return _non_negative(dt.timestamp() * 1000.0, "observed_at")
    if isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError as exc:
            raise TypeError("observed_at must be ISO-8601, datetime, or milliseconds") from exc
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return _non_negative(dt.timestamp() * 1000.0, "observed_at")
    raise TypeError("observed_at must be ISO-8601, datetime, or milliseconds")


def fresh_result(value: Any, validator: Optional[Mapping[str, Any]] = None, *, observed_at: Any = None,
                 independently_obtained: bool = True) -> Mapping[str, Any]:
    return {
        _RESULT: "fresh",
        "value": value,
        "source_validator": _validator(validator),
        "observed_at_ms": _observed_ms(observed_at),
        "independently_obtained": independently_obtained is not False,
    }


def not_modified_result(validator: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    return {_RESULT: "not-modified", "source_validator": _validator(validator)}


def uncacheable_result(value: Any) -> Mapping[str, Any]:
    return {_RESULT: "uncacheable", "value": value}


def _normalize(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping) and value.get(_RESULT) == "fresh":
        return {"kind": "fresh", "value": value.get("value"), "source_validator": _validator(value.get("source_validator")),
                "observed_at_ms": _observed_ms(value.get("observed_at_ms")),
                "independently_obtained": value.get("independently_obtained") is not False}
    if isinstance(value, Mapping) and value.get(_RESULT) == "not-modified":
        return {"kind": "not-modified", "source_validator": _validator(value.get("source_validator"))}
    if isinstance(value, Mapping) and value.get(_RESULT) == "uncacheable":
        return {"kind": "uncacheable", "value": value.get("value")}
    return {"kind": "fresh", "value": value, "source_validator": None, "observed_at_ms": None,
            "independently_obtained": True}


def _clone(value: Any) -> tuple[bool, Any]:
    try:
        return True, copy.deepcopy(value)
    except Exception:
        return False, None


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _b64e(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * ((4 - len(value) % 4) % 4))


class _AesGcmCodec:
    def __init__(self, key_material: bytes | bytearray | memoryview) -> None:
        key = bytes(key_material)
        if len(key) != 32:
            raise TypeError("private codec key must be exactly 32 bytes")
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        except ImportError as exc:
            raise RuntimeError("AES-GCM codec requires `pip install seenrelay[crypto]`") from exc
        self._aes = AESGCM(key)

    def seal(self, entry: Any, coordinate_key: str) -> str:
        nonce = os.urandom(12)
        payload = json.dumps(entry, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        encrypted = self._aes.encrypt(nonce, payload, coordinate_key.encode("utf-8"))
        return f"aes256gcm-json-v1.{_b64e(nonce)}.{_b64e(encrypted[-16:])}.{_b64e(encrypted[:-16])}"

    def open(self, sealed: str, coordinate_key: str) -> Any:
        if not isinstance(sealed, str):
            raise TypeError("private store payload must be a string")
        parts = sealed.split(".")
        if len(parts) != 4 or parts[0] != "aes256gcm-json-v1":
            raise ValueError("unsupported private store payload")
        nonce, tag, ciphertext = _b64d(parts[1]), _b64d(parts[2]), _b64d(parts[3])
        if len(nonce) != 12 or len(tag) != 16:
            raise ValueError("invalid private store payload")
        plaintext = self._aes.decrypt(nonce, ciphertext + tag, coordinate_key.encode("utf-8"))
        return json.loads(plaintext.decode("utf-8"))


def create_aes_gcm_private_codec(key_material: bytes | bytearray | memoryview) -> Any:
    """Built-in AES-256-GCM codec; requires the optional ``seenrelay[crypto]`` extra."""
    return _AesGcmCodec(key_material)


@dataclass
class _Entry:
    value: Any
    confirmed_at_ms: float
    source_validator: Optional[dict[str, str]] = None
    observed_at_ms: Optional[float] = None
    independently_obtained: bool = True

    def payload(self) -> dict[str, Any]:
        ok, value = _clone(self.value)
        if not ok:
            raise TypeError("value cannot be copied for private storage")
        return {"value": value, "confirmed_at_ms": self.confirmed_at_ms,
                "source_validator": copy.deepcopy(self.source_validator), "observed_at_ms": self.observed_at_ms,
                "independently_obtained": self.independently_obtained}

    @classmethod
    def from_payload(cls, value: Any) -> "_Entry":
        if not isinstance(value, Mapping) or "value" not in value:
            raise ValueError("invalid private store entry")
        confirmed = _non_negative(value.get("confirmed_at_ms"), "confirmed_at_ms")
        source = _validator(value.get("source_validator"))
        if value.get("source_validator") is not None and source is None:
            raise ValueError("invalid private store entry")
        return cls(copy.deepcopy(value["value"]), confirmed, source, _observed_ms(value.get("observed_at_ms")),
                   value.get("independently_obtained") is not False)


def _telemetry() -> dict[str, int]:
    return {name: 0 for name in (
        "guard_calls", "inflight_coalesced", "local_fresh_hits", "local_uncacheable_values", "private_reads",
        "private_read_hits", "private_fresh_hits", "private_writes", "private_read_failures", "private_write_failures",
        "source_conditional_attempts", "source_not_modified_hits", "validation_calls", "validated_uncacheable",
        "relay_check_calls", "relay_observe_calls")}


class SeenRelayZeroState:
    def __init__(self, *, local_max_age_ms: float = 0, validator_retention_ms: float = 86_400_000,
                 private_store: Any = None, private_codec: Any = None, private_max_age_ms: float = 0,
                 private_validator_retention_ms: Optional[float] = None, max_entries: int = 1000,
                 now: Callable[[], float] = _now_ms) -> None:
        self.local_max_age_ms = _non_negative(local_max_age_ms, "local_max_age_ms")
        self.validator_retention_ms = _non_negative(validator_retention_ms, "validator_retention_ms")
        self.private_max_age_ms = _non_negative(private_max_age_ms, "private_max_age_ms")
        self.private_validator_retention_ms = _non_negative(
            self.validator_retention_ms if private_validator_retention_ms is None else private_validator_retention_ms,
            "private_validator_retention_ms")
        self.max_entries = _positive_int(max_entries, "max_entries")
        if not callable(now):
            raise TypeError("now must be callable")
        if (private_store is None) != (private_codec is None):
            raise TypeError("private_store and private_codec must be configured together")
        if private_store is not None and (not callable(getattr(private_store, "get", None)) or
                                          not callable(getattr(private_store, "set", None))):
            raise TypeError("private_store must provide get(key) and set(key, sealed_value)")
        if private_codec is not None and (not callable(getattr(private_codec, "open", None)) or
                                          not callable(getattr(private_codec, "seal", None))):
            raise TypeError("private_codec must provide open(sealed, key) and seal(entry, key)")
        self.private_store, self.private_codec, self._now = private_store, private_codec, now
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._inflight: dict[str, asyncio.Task[Any]] = {}
        self._metrics = _telemetry()

    def get_telemetry(self) -> Mapping[str, Any]:
        return copy.deepcopy({"schema": "seenrelay-python-zero-state-telemetry-v0", "edge": self._metrics,
                              "interpretation": {"hosted_operations_added": 0, "shared_check_default": "off",
                              "automatic_shared_reuse_authorized": False,
                              "private_reuse_requires_positive_freshness_window": True}})

    def reset_telemetry(self) -> None:
        self._metrics = _telemetry()

    def clear_local(self) -> None:
        self._entries.clear()

    def _remember(self, key: str, entry: _Entry) -> None:
        if not entry.source_validator and self.local_max_age_ms <= 0:
            self._entries.pop(key, None)
            return
        self._entries.pop(key, None)
        self._entries[key] = entry
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)

    @staticmethod
    def _fresh(entry: Optional[_Entry], max_age_ms: float, now_ms: float) -> bool:
        return bool(entry and max_age_ms > 0 and now_ms - entry.confirmed_at_ms <= max_age_ms)

    @staticmethod
    def _retained(entry: Optional[_Entry], retention_ms: float, now_ms: float) -> bool:
        return bool(entry and entry.source_validator and retention_ms > 0 and now_ms - entry.confirmed_at_ms <= retention_ms)

    async def _read_private(self, key: str) -> Optional[_Entry]:
        if self.private_store is None:
            return None
        self._metrics["private_reads"] += 1
        try:
            sealed = await _maybe_await(self.private_store.get(key))
            if sealed is None:
                return None
            entry = _Entry.from_payload(await _maybe_await(self.private_codec.open(sealed, key)))
            self._metrics["private_read_hits"] += 1
            return entry
        except Exception:
            self._metrics["private_read_failures"] += 1
            return None

    async def _write_private(self, key: str, entry: _Entry) -> None:
        if self.private_store is None or (not entry.source_validator and self.private_max_age_ms <= 0):
            return
        try:
            sealed = await _maybe_await(self.private_codec.seal(entry.payload(), key))
            await _maybe_await(self.private_store.set(key, sealed))
            self._metrics["private_writes"] += 1
        except Exception:
            self._metrics["private_write_failures"] += 1

    async def guard(self, *, coordinate: Any, validate: Callable[..., Any]) -> Any:
        if not callable(validate):
            raise TypeError("validate must be callable")
        key = sha256_json_fingerprint(coordinate)
        self._metrics["guard_calls"] += 1
        if key in self._inflight:
            self._metrics["inflight_coalesced"] += 1
            return copy.deepcopy(await self._inflight[key])
        task = asyncio.create_task(self._guard_one(key, validate))
        self._inflight[key] = task
        try:
            return await task
        finally:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)

    async def _guard_one(self, key: str, validate: Callable[..., Any]) -> Any:
        now_ms = _non_negative(self._now(), "now()")
        local = self._entries.get(key)
        if self._fresh(local, self.local_max_age_ms, now_ms):
            ok, value = _clone(local.value)
            if ok:
                self._metrics["local_fresh_hits"] += 1
                return value
            self._metrics["local_uncacheable_values"] += 1

        private = await self._read_private(key)
        if self._fresh(private, self.private_max_age_ms, now_ms):
            ok, value = _clone(private.value)
            if ok:
                self._metrics["private_fresh_hits"] += 1
                self._remember(key, private)
                return value

        candidates: list[_Entry] = []
        if self._retained(local, self.validator_retention_ms, now_ms):
            candidates.append(local)
        if self._retained(private, self.private_validator_retention_ms, now_ms):
            candidates.append(private)
        retained = max(candidates, key=lambda e: e.confirmed_at_ms) if candidates else None
        headers = _headers(retained.source_validator) if retained else {}
        if headers:
            self._metrics["source_conditional_attempts"] += 1

        self._metrics["validation_calls"] += 1
        try:
            sig = inspect.signature(validate)
        except (TypeError, ValueError):
            sig = None
        if sig is None:
            raw = validate(headers)
        else:
            try:
                sig.bind(headers)
            except TypeError:
                try:
                    sig.bind()
                except TypeError as exc:
                    raise TypeError("validate must accept conditional headers or no arguments") from exc
                raw = validate()
            else:
                raw = validate(headers)
        result = _normalize(await _maybe_await(raw))
        confirmed = _non_negative(self._now(), "now()")

        if result["kind"] == "uncacheable":
            self._metrics["validated_uncacheable"] += 1
            return result["value"]
        if result["kind"] == "not-modified":
            if retained is None:
                raise RuntimeError("not_modified_result requires a retained local/private value")
            self._metrics["source_not_modified_hits"] += 1
            entry = _Entry(copy.deepcopy(retained.value), confirmed, result.get("source_validator") or retained.source_validator,
                           retained.observed_at_ms, retained.independently_obtained)
            self._remember(key, entry)
            await self._write_private(key, entry)
            return copy.deepcopy(entry.value)

        ok, value = _clone(result["value"])
        if not ok:
            self._metrics["validated_uncacheable"] += 1
            return result["value"]
        observed = result.get("observed_at_ms")
        if observed is not None:
            confirmed = min(confirmed, observed)
        entry = _Entry(value, confirmed, result.get("source_validator"), observed,
                       result.get("independently_obtained") is not False)
        self._remember(key, entry)
        await self._write_private(key, entry)
        return copy.deepcopy(entry.value)
