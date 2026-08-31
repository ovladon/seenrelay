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


_AMBIENT_INTEGRATION_CATALOG = {
    "schema": "seenrelay-ambient-integration-catalog-v0",
    "language": "python",
    "hosted_operations_added": 0,
    "telemetry_added": False,
    "automatic_reuse_authorized": False,
    "integrations": [
        {"id": "mcp.generic-python.v0", "framework": "mcp", "export_name": "ambient_mcp_client", "boundary": "client.call_tool", "default_mode": "local-shadow", "active_reuse_available": False, "optional_dependency": None},
        {"id": "openai-agents.mcp-python.v0", "framework": "openai-agents", "export_name": "ambient_openai_agents_mcp_server", "boundary": "mcp-server.completed-call", "default_mode": "local-shadow", "active_reuse_available": False, "optional_dependency": "openai-agents"},
        {"id": "langchain.mcp-python.v0", "framework": "langchain-mcp-adapters", "export_name": "ambient_langchain_mcp_client", "boundary": "MultiServerMCPClient.get_tools", "default_mode": "local-shadow", "active_reuse_available": False, "optional_dependency": "langchain-mcp-adapters"},
        {"id": "pydantic-ai.toolset-python.v0", "framework": "pydantic-ai", "export_name": "ambient_pydantic_ai_toolset", "boundary": "WrapperToolset.call_tool", "default_mode": "local-shadow", "active_reuse_available": False, "optional_dependency": "pydantic-ai"},
    ],
}


def ambient_integration_catalog() -> Mapping[str, Any]:
    """Return local package capability metadata without network discovery."""
    return deepcopy(_AMBIENT_INTEGRATION_CATALOG)


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



def _ambient_json_projection(value: Any) -> Any:
    """Return a JSON projection without retaining framework objects."""
    if value is None or isinstance(value, (bool, int, float, str, list, dict)):
        return value
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json", by_alias=True)
        except TypeError:
            return model_dump()
    raise TypeError("result is not safely projectable to JSON")


class _AmbientLangChainMcpGeneration:
    """One local-only meter bound to one LangChain get_tools() generation."""

    _KNOWN_REQUEST_FIELDS = {"name", "args", "server_name", "headers", "runtime"}

    def __init__(self, generation: int, *, max_coordinates: int = 1000) -> None:
        self.generation = generation
        self.max_coordinates = _positive_int(max_coordinates, "max_coordinates")
        self._coordinates: OrderedDict[str, str] = OrderedDict()
        self._tools: dict[str, dict[str, Any]] = {}
        self._totals: dict[str, float | int] = {
            "calls": 0, "failures": 0, "measured": 0, "first": 0,
            "repeats": 0, "unchanged": 0, "changed": 0, "refused": 0,
            "authoritative_ms": 0.0, "avoidable_ms_upper_bound": 0.0,
        }

    def _metric(self, server_name: str, name: str) -> dict[str, Any]:
        key = f"{server_name}\x00{name}"
        return self._tools.setdefault(key, {
            "generation": self.generation, "server_name": server_name, "tool": name,
            "calls": 0, "measured": 0, "first": 0, "repeats": 0,
            "unchanged": 0, "changed": 0, "refused": 0,
            "avoidable_ms_upper_bound": 0.0,
        })

    def _touch(self, coordinate: str, result: str) -> None:
        self._coordinates.pop(coordinate, None)
        self._coordinates[coordinate] = result
        while len(self._coordinates) > self.max_coordinates:
            self._coordinates.popitem(last=False)

    def _refuse(self, metric: dict[str, Any]) -> None:
        self._totals["refused"] += 1
        metric["refused"] += 1

    async def __call__(self, request: Any, handler: Any) -> Any:
        self._totals["calls"] += 1
        raw_server = getattr(request, "server_name", None)
        raw_name = getattr(request, "name", None)
        server_name = raw_server.strip() if isinstance(raw_server, str) and raw_server.strip() else "<invalid-server-name>"
        name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else "<invalid-tool-name>"
        metric = self._metric(server_name, name)
        metric["calls"] += 1

        started = time.perf_counter()
        try:
            result = handler(request)
            result = await result if inspect.isawaitable(result) else result
        except Exception:
            self._totals["failures"] += 1
            raise
        elapsed = max(0.0, (time.perf_counter() - started) * 1000.0)
        self._totals["authoritative_ms"] += elapsed

        try:
            if server_name.startswith("<invalid-") or name.startswith("<invalid-"):
                raise TypeError("invalid LangChain interceptor identity")
            request_fields = set(vars(request)) if hasattr(request, "__dict__") else self._KNOWN_REQUEST_FIELDS
            if request_fields - self._KNOWN_REQUEST_FIELDS:
                raise TypeError("unknown LangChain request fields require review")
            args = getattr(request, "args", None)
            headers = getattr(request, "headers", None)
            coordinate = fingerprint_jcs({
                "protocol": "langchain-mcp-interceptor-exact-v1",
                "generation": self.generation,
                "server": server_name,
                "name": name,
                "arguments": {} if args is None else args,
                "headers": headers,
            })
            result_fp = fingerprint_jcs(_ambient_json_projection(result))
        except Exception:
            self._refuse(metric)
            return result

        self._totals["measured"] += 1
        metric["measured"] += 1
        previous = self._coordinates.get(coordinate)
        if previous is None:
            self._totals["first"] += 1
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

    def report(self) -> Mapping[str, Any]:
        tools = []
        for metric in self._tools.values():
            measured = int(metric["measured"])
            tools.append({
                "generation": self.generation,
                "server_name": metric["server_name"], "tool": metric["tool"],
                "calls": int(metric["calls"]), "measured_calls": measured,
                "first_observations": int(metric["first"]),
                "exact_repeat_validations": int(metric["repeats"]),
                "exact_unchanged_repeats": int(metric["unchanged"]),
                "exact_changed_repeats": int(metric["changed"]),
                "refused_measurements": int(metric["refused"]),
                "exact_repeat_rate": int(metric["repeats"]) / measured if measured else 0.0,
                "exact_unchanged_repeat_rate": int(metric["unchanged"]) / measured if measured else 0.0,
                "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": float(metric["avoidable_ms_upper_bound"]),
            })
        tools.sort(key=lambda x: (-x["exact_unchanged_repeats"], x["server_name"], x["tool"]))
        return {
            "generation": self.generation,
            "calls": int(self._totals["calls"]), "authoritative_failures": int(self._totals["failures"]),
            "measured_calls": int(self._totals["measured"]), "first_observations": int(self._totals["first"]),
            "exact_repeat_validations": int(self._totals["repeats"]),
            "exact_unchanged_repeats": int(self._totals["unchanged"]), "exact_changed_repeats": int(self._totals["changed"]),
            "refused_measurements": int(self._totals["refused"]),
            "authoritative_shadow_ms_total": float(self._totals["authoritative_ms"]),
            "upper_bound_avoidable_calls_before_native_and_check_overhead": int(self._totals["unchanged"]),
            "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": float(self._totals["avoidable_ms_upper_bound"]),
            "candidate_tools": [x for x in tools if x["exact_unchanged_repeats"] > 0],
            "tools": tools,
        }


class AmbientLangChainMcpClient:
    """Drop-in local-shadow wrapper for LangChain Python MultiServerMCPClient.

    Each get_tools() call receives a fresh SeenRelay meter appended LAST to the
    client's existing interceptor list. LangChain tools close over that exact
    list, so restoring client.tool_interceptors after tool construction does
    not change the returned tools. Separate get_tools() generations are never
    compared with one another, avoiding false equivalence after client config
    changes. No CHECK/OBSERVE or active reuse is performed.
    """

    def __init__(self, client: Any, *, max_coordinates: int = 1000) -> None:
        get_tools = getattr(client, "get_tools", None)
        if not callable(get_tools):
            raise TypeError("client must provide get_tools()")
        if not hasattr(client, "tool_interceptors"):
            raise TypeError("client must expose tool_interceptors")
        self._client = client
        self._get_tools = get_tools
        self.max_coordinates = _positive_int(max_coordinates, "max_coordinates")
        self._generation_sequence = 0
        self._generations: list[_AmbientLangChainMcpGeneration] = []
        import asyncio
        self._get_tools_lock = asyncio.Lock()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)

    async def get_tools(self, *args: Any, **kwargs: Any) -> Any:
        async with self._get_tools_lock:
            original = getattr(self._client, "tool_interceptors")
            if original is None:
                existing: list[Any] = []
            elif isinstance(original, (list, tuple)):
                existing = list(original)
            else:
                raise TypeError("client.tool_interceptors must be a list, tuple, or None")
            if any(not callable(item) for item in existing):
                raise TypeError("client.tool_interceptors must contain only callables")

            self._generation_sequence += 1
            meter = _AmbientLangChainMcpGeneration(self._generation_sequence, max_coordinates=self.max_coordinates)
            injected = [*existing, meter]
            setattr(self._client, "tool_interceptors", injected)
            try:
                value = self._get_tools(*args, **kwargs)
                tools = await value if inspect.isawaitable(value) else value
            finally:
                # Restore only our own temporary assignment. If caller code
                # intentionally changed the attribute concurrently, do not
                # overwrite that external change.
                if getattr(self._client, "tool_interceptors", None) is injected:
                    setattr(self._client, "tool_interceptors", original)
            self._generations.append(meter)
            return tools

    def get_report(self) -> Mapping[str, Any]:
        generations = [dict(m.report()) for m in self._generations]
        tools = [dict(tool) for generation in generations for tool in generation["tools"]]
        candidates = [dict(tool) for generation in generations for tool in generation["candidate_tools"]]
        sum_field = lambda name: sum(int(g[name]) for g in generations)
        sum_float = lambda name: sum(float(g[name]) for g in generations)
        return deepcopy({
            "schema": "seenrelay-ambient-langchain-python-mcp-client-report-v0",
            "framework": "langchain-mcp-adapters", "boundary": "get_tools/interceptor",
            "get_tools_generations": len(generations),
            "calls": sum_field("calls"), "authoritative_failures": sum_field("authoritative_failures"),
            "measured_calls": sum_field("measured_calls"), "first_observations": sum_field("first_observations"),
            "exact_repeat_validations": sum_field("exact_repeat_validations"),
            "exact_unchanged_repeats": sum_field("exact_unchanged_repeats"),
            "exact_changed_repeats": sum_field("exact_changed_repeats"),
            "refused_measurements": sum_field("refused_measurements"),
            "authoritative_shadow_ms_total": sum_float("authoritative_shadow_ms_total"),
            "upper_bound_avoidable_calls_before_native_and_check_overhead": sum_field("upper_bound_avoidable_calls_before_native_and_check_overhead"),
            "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": sum_float("upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead"),
            "candidate_tools": candidates, "tools": tools, "generations": generations,
            "interpretation": {
                "savings_proven": False, "native_controls_measured": False,
                "relay_check_overhead_measured": False, "automatic_reuse_authorized": False,
                "public_claim_authorized": False, "exact_repetition_only": True,
                "active_mode_available": False, "seenrelay_is_injected_last": True,
                "cross_get_tools_generation_comparison": False,
                "unknown_request_fields_fail_closed": True,
                "next_step": "REVIEW_CANDIDATE_TOOLS_AGAINST_NATIVE_CONTROLS" if candidates else "KEEP_RUNNING_NATURALLY",
            },
        })

    @property
    def seenrelay_ambient(self) -> Mapping[str, Any]:
        return {
            "schema": "seenrelay-ambient-langchain-python-mcp-client-v0",
            "framework": "langchain-mcp-adapters", "boundary": "get_tools/interceptor",
            "mode": "local-shadow-only", "active_reuse_enabled": False,
            "network_calls_from_shadow": 0, "shared_check_from_shadow": False,
            "observe_from_shadow": False, "raw_arguments_retained": False,
            "raw_results_retained": False, "seenrelay_is_injected_last": True,
            "cross_get_tools_generation_comparison": False,
            "get_report": self.get_report,
        }


def ambient_langchain_mcp_client(client: Any, *, max_coordinates: int = 1000) -> AmbientLangChainMcpClient:
    return AmbientLangChainMcpClient(client, max_coordinates=max_coordinates)


class _AmbientPydanticSharedReport:
    """Shared aggregate counters; never stores coordinates, raw args, or raw results."""

    def __init__(self, label: str) -> None:
        import threading
        self.label = label
        self.lock = threading.Lock()
        self.runs = 0
        self.calls = 0
        self.failures = 0
        self.refused = 0
        self.repeats = 0
        self.unchanged = 0
        self.changed = 0
        self.authoritative_ms = 0.0
        self.avoidable_ms_upper_bound = 0.0
        self.tools: dict[str, dict[str, float | int]] = {}

    def start_run(self) -> int:
        with self.lock:
            self.runs += 1
            return self.runs

    def add(self, *, name: str, elapsed: float, outcome: str) -> None:
        with self.lock:
            self.calls += 1
            self.authoritative_ms += elapsed
            metric = self.tools.setdefault(name, {
                "calls": 0, "refused": 0, "repeats": 0, "unchanged": 0,
                "changed": 0, "avoidable_ms_upper_bound": 0.0,
            })
            metric["calls"] += 1
            if outcome == "refused":
                self.refused += 1
                metric["refused"] += 1
            elif outcome == "first":
                pass
            elif outcome == "unchanged":
                self.repeats += 1
                self.unchanged += 1
                self.avoidable_ms_upper_bound += elapsed
                metric["repeats"] += 1
                metric["unchanged"] += 1
                metric["avoidable_ms_upper_bound"] += elapsed
            elif outcome == "changed":
                self.repeats += 1
                self.changed += 1
                metric["repeats"] += 1
                metric["changed"] += 1
            else:
                raise ValueError("unknown PydanticAI ambient outcome")

    def add_failure(self) -> None:
        with self.lock:
            self.calls += 1
            self.failures += 1

    def report(self) -> Mapping[str, Any]:
        with self.lock:
            tools = [
                {
                    "tool": name,
                    "calls": int(m["calls"]),
                    "exact_repeat_validations": int(m["repeats"]),
                    "exact_unchanged_repeats": int(m["unchanged"]),
                    "exact_changed_repeats": int(m["changed"]),
                    "refused_measurements": int(m["refused"]),
                    "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": float(m["avoidable_ms_upper_bound"]),
                }
                for name, m in self.tools.items()
            ]
            tools.sort(key=lambda x: (-x["exact_unchanged_repeats"], x["tool"]))
            return deepcopy({
                "schema": "seenrelay-ambient-pydantic-ai-toolset-report-v0",
                "toolset_key": self.label,
                "runs_observed": self.runs,
                "calls": self.calls,
                "authoritative_failures": self.failures,
                "exact_repeat_validations": self.repeats,
                "exact_unchanged_repeats": self.unchanged,
                "exact_changed_repeats": self.changed,
                "refused_measurements": self.refused,
                "authoritative_shadow_ms_total": self.authoritative_ms,
                "upper_bound_avoidable_calls_before_native_and_check_overhead": self.unchanged,
                "upper_bound_avoidable_authoritative_ms_before_native_and_check_overhead": self.avoidable_ms_upper_bound,
                "candidate_tools": [x for x in tools if x["exact_unchanged_repeats"] > 0],
                "tools": tools,
                "interpretation": {
                    "savings_proven": False,
                    "native_controls_measured": False,
                    "relay_check_overhead_measured": False,
                    "automatic_reuse_authorized": False,
                    "public_claim_authorized": False,
                    "active_mode_available": False,
                    "cross_run_equivalence_assumed": False,
                    "exact_repetition_only": True,
                    "next_step": "REVIEW_CANDIDATE_TOOLS_AGAINST_NATIVE_CONTROLS" if self.unchanged else "KEEP_RUNNING_NATURALLY",
                },
            })


def ambient_pydantic_ai_toolset(toolset: Any, *, toolset_key: Optional[str] = None, max_coordinates: int = 1000) -> Any:
    """Wrap a PydanticAI toolset with local-only Ambient measurement.

    PydanticAI remains an optional dependency: this function imports
    ``WrapperToolset`` only when called. The returned wrapper calls the wrapped
    toolset exactly once, retains only canonical fingerprints and aggregate
    counters, performs no SeenRelay network operation, and never authorizes
    reuse. Coordinate state is fresh for each PydanticAI run.
    """
    try:
        from pydantic_ai.toolsets.wrapper import WrapperToolset
    except ImportError as exc:  # pragma: no cover - exact message is unit-tested with a fake importer
        raise RuntimeError("ambient_pydantic_ai_toolset() requires pydantic-ai to be installed") from exc

    if toolset is None:
        raise TypeError("toolset is required")
    max_coordinates = _positive_int(max_coordinates, "max_coordinates")
    raw_key = toolset_key or getattr(toolset, "id", None) or type(toolset).__name__
    label = _text(raw_key, "toolset_key")
    shared = _AmbientPydanticSharedReport(label)

    class SeenRelayAmbientPydanticToolset(WrapperToolset):
        def __init__(self, wrapped: Any, *, run_id: int = 0) -> None:
            super().__init__(wrapped)
            self._seenrelay_run_id = run_id
            self._seenrelay_coordinates: OrderedDict[str, str] = OrderedDict()

        async def for_run(self, ctx: Any) -> Any:
            wrapped = self.wrapped
            transition = getattr(wrapped, "for_run", None)
            if callable(transition):
                value = transition(ctx)
                wrapped = await value if inspect.isawaitable(value) else value
            return SeenRelayAmbientPydanticToolset(wrapped, run_id=shared.start_run())

        async def call_tool(self, name: str, tool_args: dict[str, Any], ctx: Any, tool: Any) -> Any:
            started = time.perf_counter()
            try:
                result = await super().call_tool(name, tool_args, ctx, tool)
            except Exception:
                shared.add_failure()
                raise
            elapsed = max(0.0, (time.perf_counter() - started) * 1000.0)

            outcome = "refused"
            try:
                if self._seenrelay_run_id < 1:
                    raise TypeError("PydanticAI for_run() lifecycle has not bound this wrapper")
                tool_def = getattr(tool, "tool_def", None)
                effective_name = _text(getattr(tool_def, "name", None) or name, "tool name")
                toolset_id = getattr(tool_def, "toolset_id", None)
                capability_id = getattr(tool_def, "capability_id", None)
                metadata = getattr(tool_def, "metadata", None)
                kind = getattr(tool_def, "kind", None)
                coordinate = fingerprint_jcs({
                    "protocol": "pydantic-ai-toolset-call-exact-v1",
                    "run": self._seenrelay_run_id,
                    "toolset": label,
                    "toolset_id": toolset_id,
                    "capability_id": capability_id,
                    "kind": kind,
                    "name": effective_name,
                    "metadata": _ambient_json_projection(metadata),
                    "arguments": _ambient_json_projection(tool_args),
                })
                result_fp = fingerprint_jcs(_ambient_json_projection(result))
                previous = self._seenrelay_coordinates.get(coordinate)
                self._seenrelay_coordinates.pop(coordinate, None)
                self._seenrelay_coordinates[coordinate] = result_fp
                while len(self._seenrelay_coordinates) > max_coordinates:
                    self._seenrelay_coordinates.popitem(last=False)
                if previous is None:
                    outcome = "first"
                elif previous == result_fp:
                    outcome = "unchanged"
                else:
                    outcome = "changed"
            except Exception:
                effective_name = name if isinstance(name, str) and name else "<unknown>"
                outcome = "refused"
            shared.add(name=effective_name, elapsed=elapsed, outcome=outcome)
            return result

        @property
        def seenrelay_ambient(self) -> Mapping[str, Any]:
            return {
                "schema": "seenrelay-ambient-pydantic-ai-toolset-v0",
                "framework": "pydantic-ai",
                "boundary": "WrapperToolset.call_tool",
                "mode": "local-shadow-only",
                "toolset_key": label,
                "active_reuse_enabled": False,
                "network_calls_from_shadow": 0,
                "shared_check_from_shadow": False,
                "observe_from_shadow": False,
                "raw_arguments_retained": False,
                "raw_results_retained": False,
                "cross_run_coordinates_shared": False,
                "get_report": shared.report,
            }

    root = SeenRelayAmbientPydanticToolset(toolset)
    # Expose the aggregate report on the root wrapper; run-bound clones share
    # only counters, never coordinate/result fingerprints.
    return root
