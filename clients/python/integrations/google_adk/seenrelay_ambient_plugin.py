# SPDX-License-Identifier: MIT
"""Compatibility candidate for a Google ADK SeenRelay ambient plugin.

This module is deliberately local-only and shadow-only. It never calls hosted
SeenRelay CHECK/OBSERVE, never short-circuits an ADK tool, and never replaces a
tool result. It measures exact repeated JSON tool validations so a workload can
be evaluated before any reuse policy is considered.
"""

from __future__ import annotations

from collections import OrderedDict
import time
from typing import Any, Iterable, Mapping, Optional

from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from seenrelay_ambient import fingerprint_jcs


class SeenRelayAmbientPlugin(BasePlugin):
    """Measure exact repeated ADK tool validations without suppressing them."""

    def __init__(
        self,
        *,
        max_coordinates: int = 1000,
        include_tools: Optional[Iterable[str]] = None,
    ) -> None:
        super().__init__(name="seenrelay_ambient")
        if max_coordinates < 1:
            raise ValueError("max_coordinates must be a positive integer")
        self._max_coordinates = int(max_coordinates)
        self._include_tools = (
            frozenset(str(name).strip() for name in include_tools if str(name).strip())
            if include_tools is not None
            else None
        )
        self._coordinates: OrderedDict[str, str] = OrderedDict()
        self._started: dict[tuple[str, str], float] = {}
        self._totals: dict[str, float | int] = {
            "calls": 0,
            "measured": 0,
            "first": 0,
            "repeats": 0,
            "unchanged": 0,
            "changed": 0,
            "refused": 0,
            "failures": 0,
            "authoritative_ms": 0.0,
            "avoidable_ms_upper_bound": 0.0,
        }
        self._tools: dict[str, dict[str, float | int]] = {}

    def _eligible(self, tool_name: str) -> bool:
        return self._include_tools is None or tool_name in self._include_tools

    @staticmethod
    def _call_key(tool: BaseTool, tool_context: ToolContext) -> tuple[str, str]:
        function_call_id = getattr(tool_context, "function_call_id", None)
        identity = (
            f"function:{function_call_id}"
            if isinstance(function_call_id, str) and function_call_id
            else f"context:{id(tool_context)}"
        )
        return (tool.name, identity)

    def _metric(self, tool_name: str) -> dict[str, float | int]:
        return self._tools.setdefault(
            tool_name,
            {
                "calls": 0,
                "measured": 0,
                "first": 0,
                "repeats": 0,
                "unchanged": 0,
                "changed": 0,
                "refused": 0,
                "failures": 0,
                "authoritative_ms": 0.0,
                "avoidable_ms_upper_bound": 0.0,
            },
        )

    def _touch(self, coordinate: str, result_fingerprint: str) -> None:
        self._coordinates.pop(coordinate, None)
        self._coordinates[coordinate] = result_fingerprint
        while len(self._coordinates) > self._max_coordinates:
            self._coordinates.popitem(last=False)

    async def before_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
    ) -> None:
        del tool_args
        if not self._eligible(tool.name):
            return None
        self._totals["calls"] += 1
        self._metric(tool.name)["calls"] += 1
        self._started[self._call_key(tool, tool_context)] = time.perf_counter()
        return None

    async def after_tool_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        result: dict[str, Any],
    ) -> None:
        if not self._eligible(tool.name):
            return None

        started = self._started.pop(self._call_key(tool, tool_context), None)
        elapsed_ms = (
            max(0.0, (time.perf_counter() - started) * 1000.0)
            if started is not None
            else 0.0
        )
        metric = self._metric(tool.name)
        self._totals["authoritative_ms"] += elapsed_ms
        metric["authoritative_ms"] += elapsed_ms

        try:
            coordinate = fingerprint_jcs(
                {
                    "protocol": "google-adk-tool-call-exact-v1",
                    "tool": tool.name,
                    "arguments": tool_args,
                }
            )
            result_fingerprint = fingerprint_jcs(result)
        except (TypeError, ValueError, OverflowError):
            self._totals["refused"] += 1
            metric["refused"] += 1
            return None

        self._totals["measured"] += 1
        metric["measured"] += 1
        previous = self._coordinates.get(coordinate)
        if previous is None:
            self._totals["first"] += 1
            metric["first"] += 1
            self._touch(coordinate, result_fingerprint)
            return None

        self._totals["repeats"] += 1
        metric["repeats"] += 1
        if previous == result_fingerprint:
            self._totals["unchanged"] += 1
            metric["unchanged"] += 1
            self._totals["avoidable_ms_upper_bound"] += elapsed_ms
            metric["avoidable_ms_upper_bound"] += elapsed_ms
        else:
            self._totals["changed"] += 1
            metric["changed"] += 1
        self._touch(coordinate, result_fingerprint)
        return None

    async def on_tool_error_callback(
        self,
        *,
        tool: BaseTool,
        tool_args: dict[str, Any],
        tool_context: ToolContext,
        error: Exception,
    ) -> None:
        del tool_args, error
        if not self._eligible(tool.name):
            return None
        self._started.pop(self._call_key(tool, tool_context), None)
        self._totals["failures"] += 1
        self._metric(tool.name)["failures"] += 1
        return None

    def get_report(self) -> Mapping[str, Any]:
        """Return aggregate-only local measurements."""
        return {
            "schema": "seenrelay-google-adk-ambient-v1",
            "mode": "local-shadow",
            "hosted_operations": 0,
            "automatic_reuse_authorized": False,
            "raw_arguments_retained": False,
            "raw_results_retained": False,
            "coordinates_retained": len(self._coordinates),
            "totals": dict(self._totals),
            "tools": [
                {"tool": name, **dict(metric)}
                for name, metric in sorted(self._tools.items())
            ],
        }
