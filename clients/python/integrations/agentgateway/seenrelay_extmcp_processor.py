# SPDX-License-Identifier: MIT
"""Local shadow processor core for agentgateway ExtMcp tools/call hooks.

The processor is intentionally measurement-only. It never suppresses or mutates
an MCP request/response, never calls hosted SeenRelay CHECK/OBSERVE, and only
measures tools explicitly allowlisted by the operator.
"""

from __future__ import annotations

from collections import OrderedDict
import json
from typing import Any, Iterable, Mapping, Optional

from seenrelay_ambient import fingerprint_jcs

_COORDINATE_KEY = "seenrelay_coordinate"


class AgentgatewayExtMcpShadow:
    """Measure exact repeated MCP tool validations from ExtMcp request/response pairs."""

    def __init__(
        self,
        *,
        include_tools: Iterable[str],
        max_coordinates: int = 1000,
    ) -> None:
        names = frozenset(str(name).strip() for name in include_tools if str(name).strip())
        if not names:
            raise ValueError("include_tools must explicitly allow at least one tool name")
        if max_coordinates < 1:
            raise ValueError("max_coordinates must be a positive integer")
        self._include_tools = names
        self._max_coordinates = int(max_coordinates)
        self._coordinates: OrderedDict[str, str] = OrderedDict()
        self._totals: dict[str, int] = {
            "requests": 0,
            "eligible_requests": 0,
            "responses": 0,
            "measured_responses": 0,
            "first": 0,
            "repeats": 0,
            "unchanged": 0,
            "changed": 0,
            "refused": 0,
        }
        self._tools: dict[str, dict[str, int]] = {}

    def _metric(self, name: str) -> dict[str, int]:
        return self._tools.setdefault(
            name,
            {
                "requests": 0,
                "responses": 0,
                "first": 0,
                "repeats": 0,
                "unchanged": 0,
                "changed": 0,
                "refused": 0,
            },
        )

    def _touch(self, coordinate: str, result_fingerprint: str) -> None:
        self._coordinates.pop(coordinate, None)
        self._coordinates[coordinate] = result_fingerprint
        while len(self._coordinates) > self._max_coordinates:
            self._coordinates.popitem(last=False)

    def check_request(
        self,
        *,
        method: str,
        service_names: Iterable[str],
        request_bytes: Optional[bytes],
    ) -> Mapping[str, Any]:
        """Return metadata for an eligible tools/call request; never mutate it."""
        self._totals["requests"] += 1
        if method != "tools/call" or not request_bytes:
            return {}
        try:
            params = json.loads(request_bytes)
            if not isinstance(params, dict):
                raise TypeError("params must be an object")
            name = params.get("name")
            arguments = params.get("arguments", {})
            if not isinstance(name, str) or not name.strip():
                raise TypeError("tool name missing")
            name = name.strip()
            if name not in self._include_tools:
                return {}
            backends = sorted(str(value) for value in service_names)
            coordinate = fingerprint_jcs(
                {
                    "protocol": "agentgateway-extmcp-tools-call-exact-v1",
                    "backends": backends,
                    "tool": name,
                    "arguments": arguments,
                }
            )
        except (json.JSONDecodeError, TypeError, ValueError, OverflowError):
            self._totals["refused"] += 1
            return {}

        self._totals["eligible_requests"] += 1
        self._metric(name)["requests"] += 1
        return {
            _COORDINATE_KEY: coordinate,
            "seenrelay_tool": name,
        }

    def check_response(
        self,
        *,
        method: str,
        metadata_context: Mapping[str, Any],
        response_bytes: bytes,
    ) -> None:
        """Observe an authoritative result locally; never replace it."""
        self._totals["responses"] += 1
        if method != "tools/call":
            return
        coordinate = metadata_context.get(_COORDINATE_KEY)
        tool_name = metadata_context.get("seenrelay_tool")
        if not isinstance(coordinate, str) or not isinstance(tool_name, str):
            return
        if tool_name not in self._include_tools:
            return
        metric = self._metric(tool_name)
        metric["responses"] += 1
        try:
            result = json.loads(response_bytes)
            result_fingerprint = fingerprint_jcs(result)
        except (json.JSONDecodeError, TypeError, ValueError, OverflowError):
            self._totals["refused"] += 1
            metric["refused"] += 1
            return

        self._totals["measured_responses"] += 1
        previous = self._coordinates.get(coordinate)
        if previous is None:
            self._totals["first"] += 1
            metric["first"] += 1
            self._touch(coordinate, result_fingerprint)
            return

        self._totals["repeats"] += 1
        metric["repeats"] += 1
        if previous == result_fingerprint:
            self._totals["unchanged"] += 1
            metric["unchanged"] += 1
        else:
            self._totals["changed"] += 1
            metric["changed"] += 1
        self._touch(coordinate, result_fingerprint)

    def get_report(self) -> Mapping[str, Any]:
        return {
            "schema": "seenrelay-agentgateway-extmcp-shadow-v1",
            "mode": "local-shadow",
            "hosted_operations": 0,
            "automatic_reuse_authorized": False,
            "explicit_tool_allowlist": sorted(self._include_tools),
            "raw_requests_retained": False,
            "raw_responses_retained": False,
            "coordinates_retained": len(self._coordinates),
            "totals": dict(self._totals),
            "tools": [
                {"tool": name, **dict(metric)}
                for name, metric in sorted(self._tools.items())
            ],
        }
