from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
import hashlib
import inspect
import json
import math
import time
from typing import Any, Mapping, Optional


def _check_string(value: str, field: str) -> str:
    for ch in value:
        cp = ord(ch)
        if 0xD800 <= cp <= 0xDFFF:
            raise TypeError(f"{field} contains an unpaired Unicode surrogate")
    return value


def _utf16_key(value: str) -> bytes:
    _check_string(value, "object key")
    return value.encode("utf-16-be")


def _js_number(value: int | float) -> str:
    if isinstance(value, bool):
        raise TypeError("boolean is not a number")
    if isinstance(value, int):
        as_float = float(value)
        if not math.isfinite(as_float):
            raise TypeError("integer is outside the IEEE-754 finite range")
        if abs(value) <= 9007199254740991:
            return str(value)
        return _js_number(as_float)
    if not math.isfinite(value):
        raise TypeError("number must be finite")
    if value == 0:
        return "0"

    negative = value < 0
    x = -value if negative else value
    raw = repr(x).lower()

    def fixed_from_scientific(coeff: str, exp: int) -> str:
        digits = coeff.replace(".", "")
        decimal_pos = (coeff.index(".") if "." in coeff else len(coeff)) + exp
        if decimal_pos <= 0:
            return "0." + "0" * (-decimal_pos) + digits
        if decimal_pos >= len(digits):
            return digits + "0" * (decimal_pos - len(digits))
        return digits[:decimal_pos] + "." + digits[decimal_pos:]

    if "e" in raw:
        coeff, exp_raw = raw.split("e", 1)
        exp = int(exp_raw)
        if 1e-6 <= x < 1e21:
            out = fixed_from_scientific(coeff, exp)
        else:
            if coeff.endswith(".0"):
                coeff = coeff[:-2]
            out = coeff + "e" + ("+" if exp >= 0 else "") + str(exp)
    else:
        out = raw[:-2] if raw.endswith(".0") else raw
        if not (1e-6 <= x < 1e21):
            raise TypeError("unexpected Python float representation outside JCS fixed range")

    return ("-" if negative else "") + out


def _canonicalize_jcs(value: Any) -> str:
    active: set[int] = set()

    def enc(v: Any, path: str) -> str:
        if v is None:
            return "null"
        if v is True:
            return "true"
        if v is False:
            return "false"
        if isinstance(v, str):
            _check_string(v, path)
            return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        if isinstance(v, int) and not isinstance(v, bool):
            return _js_number(v)
        if isinstance(v, float):
            return _js_number(v)
        if isinstance(v, list):
            oid = id(v)
            if oid in active:
                raise TypeError("canonical evidence must not be cyclic")
            active.add(oid)
            try:
                return "[" + ",".join(enc(item, f"{path}[{i}]") for i, item in enumerate(v)) + "]"
            finally:
                active.remove(oid)
        if isinstance(v, dict):
            oid = id(v)
            if oid in active:
                raise TypeError("canonical evidence must not be cyclic")
            active.add(oid)
            try:
                for k in v:
                    if not isinstance(k, str):
                        raise TypeError(f"{path} keys must be strings")
                    _check_string(k, f"{path} key")
                keys = sorted(v.keys(), key=_utf16_key)
                return "{" + ",".join(
                    json.dumps(k, ensure_ascii=False, separators=(",", ":")) + ":" + enc(v[k], f"{path}.{k}")
                    for k in keys
                ) + "}"
            finally:
                active.remove(oid)
        raise TypeError(f"{path} is not JSON data")

    return enc(value, "evidence")


def fingerprint_jcs(value: Any) -> str:
    canonical = _canonicalize_jcs(value)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _positive_int(value: Any, name: str) -> int:
    n = int(value)
    if n < 1:
        raise ValueError(f"{name} must be a positive integer")
    return n


class AmbientMcpClient:
    """Local-only ambient shadow wrapper for Python MCP-style clients.

    The wrapper preserves authoritative calls. It retains only SHA-256
    fingerprints and aggregate metrics in memory. It performs no SeenRelay
    CHECK/OBSERVE and never authorizes reuse.
    """

    def __init__(self, client: Any, *, server_key: str = "python-mcp", max_coordinates: int = 1000) -> None:
        call = getattr(client, "call_tool", None)
        if not callable(call):
            raise TypeError("client must provide call_tool()")
        self._client = client
        self._call = call
        self.server_key = _text(server_key, "server_key")
        self.max_coordinates = _positive_int(max_coordinates, "max_coordinates")
        self._coordinates: OrderedDict[str, str] = OrderedDict()
        self._tools: dict[str, dict[str, float | int]] = {}
        self._totals: dict[str, float | int] = {
            "calls": 0, "shadow_calls": 0, "failures": 0, "refused": 0,
            "repeats": 0, "unchanged": 0, "changed": 0,
            "authoritative_ms": 0.0, "avoidable_ms_upper_bound": 0.0,
        }

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)

    def _metric(self, name: str) -> dict[str, float | int]:
        return self._tools.setdefault(name, {
            "calls": 0, "measured": 0, "first": 0, "repeats": 0,
            "unchanged": 0, "changed": 0, "refused": 0,
            "avoidable_ms_upper_bound": 0.0,
        })

    def _touch(self, coordinate: str, result: str) -> None:
        self._coordinates.pop(coordinate, None)
        self._coordinates[coordinate] = result
        while len(self._coordinates) > self.max_coordinates:
            self._coordinates.popitem(last=False)

    async def call_tool(self, tool_name: str, arguments: Any = None, *args: Any, **kwargs: Any) -> Any:
        name = _text(tool_name, "tool_name")
        metric = self._metric(name)
        self._totals["calls"] += 1
        self._totals["shadow_calls"] += 1
        metric["calls"] += 1
        started = time.perf_counter()
        try:
            value = self._call(tool_name, arguments, *args, **kwargs)
            result = await value if inspect.isawaitable(value) else value
        except Exception:
            self._totals["failures"] += 1
            raise
        elapsed = max(0.0, (time.perf_counter() - started) * 1000.0)
        self._totals["authoritative_ms"] += elapsed

        if args or kwargs:
            self._totals["refused"] += 1
            metric["refused"] += 1
            return result

        try:
            coordinate = fingerprint_jcs({
                "protocol": "mcp-tools-call-exact-v1",
                "server": self.server_key,
                "name": name,
                "arguments": {} if arguments is None else arguments,
            })
            result_fp = fingerprint_jcs(result)
        except Exception:
            self._totals["refused"] += 1
            metric["refused"] += 1
            return result

        metric["measured"] += 1
        previous = self._coordinates.get(coordinate)
        if previous is None:
            metric["first"] += 1
            self._touch(coordinate, result_fp)
            return result

        self._totals["repeats"] += 1
        metric["repeats"] += 1
        if previous == result_fp:
            self._totals["unchanged"] += 1
            metric["unchanged"] += 1
            self._totals["avoidable_ms_upper_bound"] += elapsed
            metric["avoidable_ms_upper_bound"] += elapsed
        else:
            self._totals["changed"] += 1
            metric["changed"] += 1
        self._touch(coordinate, result_fp)
        return result

    def get_report(self) -> Mapping[str, Any]:
        tools = []
        for name, m in self._tools.items():
            measured = int(m["measured"])
            tools.append({
                "tool": name,
                "calls": int(m["calls"]),
                "measured_calls": measured,
                "first_observations": int(m["first"]),
                "exact_repeat_validations": int(m["repeats"]),
                "exact_unchanged_repeats": int(m["unchanged"]),
                "exact_changed_repeats": int(m["changed"]),
                "refused_measurements": int(m["refused"]),
                "exact_repeat_rate": int(m["repeats"]) / measured if measured else 0.0,
                "exact_unchanged_repeat_rate": int(m["unchanged"]) / measured if measured else 0.0,
                "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": float(m["avoidable_ms_upper_bound"]),
            })
        tools.sort(key=lambda x: (-x["exact_unchanged_repeats"], x["tool"]))
        return deepcopy({
            "schema": "seenrelay-ambient-mcp-report-v0",
            "server_key": self.server_key,
            "calls": int(self._totals["calls"]),
            "shadow_calls": int(self._totals["shadow_calls"]),
            "active_policy_calls": 0,
            "authoritative_failures": int(self._totals["failures"]),
            "measured_shadow_calls": sum(x["measured_calls"] for x in tools),
            "exact_repeat_validations": int(self._totals["repeats"]),
            "exact_unchanged_repeats": int(self._totals["unchanged"]),
            "exact_changed_repeats": int(self._totals["changed"]),
            "refused_measurements": int(self._totals["refused"]),
            "authoritative_shadow_ms_total": float(self._totals["authoritative_ms"]),
            "upper_bound_avoidable_calls_before_native_and_check_overhead": int(self._totals["unchanged"]),
            "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": float(self._totals["avoidable_ms_upper_bound"]),
            "candidate_tools": [x for x in tools if x["exact_unchanged_repeats"] > 0],
            "tools": tools,
            "interpretation": {
                "savings_proven": False,
                "native_controls_measured": False,
                "relay_check_overhead_measured": False,
                "automatic_reuse_authorized": False,
                "public_claim_authorized": False,
                "exact_repetition_only": True,
                "active_mode_available": False,
                "next_step": "REVIEW_CANDIDATE_TOOLS_AGAINST_NATIVE_CONTROLS" if int(self._totals["unchanged"]) > 0 else "KEEP_RUNNING_NATURALLY",
            },
        })


def ambient_mcp_client(client: Any, *, server_key: str = "python-mcp", max_coordinates: int = 1000) -> AmbientMcpClient:
    return AmbientMcpClient(client, server_key=server_key, max_coordinates=max_coordinates)


class AmbientOpenAIAgentsMcpServer:
    """One-line local-shadow wrapper for OpenAI Agents Python MCPServer objects."""

    def __init__(self, server: Any, *, server_key: Optional[str] = None, max_coordinates: int = 1000) -> None:
        original = getattr(server, "call_tool", None)
        if not callable(original):
            raise TypeError("server must provide call_tool()")
        self._server = server
        key = server_key or getattr(server, "name", None) or "openai-agents-python-mcp"

        class Facade:
            async def call_tool(_, tool_name: str, arguments: Any = None, *args: Any, **kwargs: Any) -> Any:
                value = original(tool_name, arguments, *args, **kwargs)
                return await value if inspect.isawaitable(value) else value

        self._ambient = AmbientMcpClient(Facade(), server_key=_text(key, "server_key"), max_coordinates=max_coordinates)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._server, name)

    async def call_tool(self, tool_name: str, arguments: Any = None, *args: Any, **kwargs: Any) -> Any:
        return await self._ambient.call_tool(tool_name, arguments, *args, **kwargs)

    @property
    def seenrelay_ambient(self) -> Mapping[str, Any]:
        return {
            "schema": "seenrelay-ambient-openai-agents-python-mcp-v0",
            "framework": "openai-agents-python",
            "boundary": "completed-call",
            "active_reuse_enabled": False,
            "get_report": self._ambient.get_report,
        }


def ambient_openai_agents_mcp_server(server: Any, *, server_key: Optional[str] = None, max_coordinates: int = 1000) -> AmbientOpenAIAgentsMcpServer:
    return AmbientOpenAIAgentsMcpServer(server, server_key=server_key, max_coordinates=max_coordinates)
