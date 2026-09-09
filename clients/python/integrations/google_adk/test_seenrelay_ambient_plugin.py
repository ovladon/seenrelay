from __future__ import annotations

import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from google.adk.plugins.plugin_manager import PluginManager

from seenrelay_ambient_plugin import SeenRelayAmbientPlugin


class DummyTool:
    def __init__(self, name: str) -> None:
        self.name = name


async def run_through_adk_callbacks(
    manager: PluginManager,
    tool: DummyTool,
    args: dict,
    result: dict,
    *,
    call_id: str,
    body_counter: list[int],
) -> dict:
    context = SimpleNamespace(function_call_id=call_id)
    early = await manager.run_before_tool_callback(
        tool=tool,
        tool_args=args,
        tool_context=context,
    )
    if early is not None:
        return early
    body_counter[0] += 1
    replacement = await manager.run_after_tool_callback(
        tool=tool,
        tool_args=args,
        tool_context=context,
        result=result,
    )
    return result if replacement is None else replacement


class SeenRelayAmbientPluginCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_repeat_never_short_circuits_authoritative_tool(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate_price")
        body_counter = [0]

        first = await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "A-1"},
            {"price": 12},
            call_id="call-1",
            body_counter=body_counter,
        )
        second = await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "A-1"},
            {"price": 12},
            call_id="call-2",
            body_counter=body_counter,
        )

        self.assertEqual(first, {"price": 12})
        self.assertEqual(second, {"price": 12})
        self.assertEqual(body_counter[0], 2)
        report = plugin.get_report()
        self.assertEqual(report["totals"]["calls"], 2)
        self.assertEqual(report["totals"]["measured"], 2)
        self.assertEqual(report["totals"]["repeats"], 1)
        self.assertEqual(report["totals"]["unchanged"], 1)
        self.assertEqual(report["totals"]["changed"], 0)
        self.assertEqual(report["hosted_operations"], 0)
        self.assertFalse(report["automatic_reuse_authorized"])

    async def test_same_coordinate_changed_result_is_not_unchanged(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate_price")
        body_counter = [0]

        await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "A-1"},
            {"price": 12},
            call_id="call-1",
            body_counter=body_counter,
        )
        await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "A-1"},
            {"price": 13},
            call_id="call-2",
            body_counter=body_counter,
        )

        report = plugin.get_report()
        self.assertEqual(report["totals"]["repeats"], 1)
        self.assertEqual(report["totals"]["changed"], 1)
        self.assertEqual(report["totals"]["unchanged"], 0)
        self.assertEqual(body_counter[0], 2)

    async def test_different_arguments_are_distinct_coordinates(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate_price")
        body_counter = [0]

        await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "A-1"},
            {"price": 12},
            call_id="call-1",
            body_counter=body_counter,
        )
        await run_through_adk_callbacks(
            manager,
            tool,
            {"sku": "B-2"},
            {"price": 12},
            call_id="call-2",
            body_counter=body_counter,
        )

        report = plugin.get_report()
        self.assertEqual(report["totals"]["first"], 2)
        self.assertEqual(report["totals"]["repeats"], 0)

    async def test_non_json_arguments_fail_open_and_preserve_result(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate_price")
        body_counter = [0]
        marker = object()

        result = await run_through_adk_callbacks(
            manager,
            tool,
            {"opaque": marker},
            {"ok": True},
            call_id="call-1",
            body_counter=body_counter,
        )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(body_counter[0], 1)
        report = plugin.get_report()
        self.assertEqual(report["totals"]["refused"], 1)
        self.assertEqual(report["totals"]["measured"], 0)

    async def test_bounded_state_evicts_old_coordinates(self) -> None:
        plugin = SeenRelayAmbientPlugin(max_coordinates=2)
        manager = PluginManager([plugin])
        tool = DummyTool("validate")
        body_counter = [0]

        for index in range(3):
            await run_through_adk_callbacks(
                manager,
                tool,
                {"id": index},
                {"value": index},
                call_id=f"call-{index}",
                body_counter=body_counter,
            )

        self.assertEqual(plugin.get_report()["coordinates_retained"], 2)

    async def test_report_retains_no_raw_arguments_or_results(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate_secret")
        body_counter = [0]
        raw_argument = "ARGUMENT-DO-NOT-RETAIN"
        raw_result = "RESULT-DO-NOT-RETAIN"

        await run_through_adk_callbacks(
            manager,
            tool,
            {"secret": raw_argument},
            {"secret": raw_result},
            call_id="call-1",
            body_counter=body_counter,
        )

        serialized = json.dumps(plugin.get_report(), sort_keys=True)
        self.assertNotIn(raw_argument, serialized)
        self.assertNotIn(raw_result, serialized)
        self.assertFalse(plugin.get_report()["raw_arguments_retained"])
        self.assertFalse(plugin.get_report()["raw_results_retained"])

    async def test_tool_error_is_observed_without_recovery_or_suppression(self) -> None:
        plugin = SeenRelayAmbientPlugin()
        manager = PluginManager([plugin])
        tool = DummyTool("validate")
        context = SimpleNamespace(function_call_id="call-error")

        self.assertIsNone(
            await manager.run_before_tool_callback(
                tool=tool,
                tool_args={"id": 1},
                tool_context=context,
            )
        )
        self.assertIsNone(
            await manager.run_on_tool_error_callback(
                tool=tool,
                tool_args={"id": 1},
                tool_context=context,
                error=RuntimeError("authoritative failure"),
            )
        )
        report = plugin.get_report()
        self.assertEqual(report["totals"]["failures"], 1)
        self.assertEqual(report["totals"]["measured"], 0)


if __name__ == "__main__":
    unittest.main()
