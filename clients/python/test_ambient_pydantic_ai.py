import asyncio
import sys
import types
import unittest

from seenrelay_ambient import ambient_pydantic_ai_toolset


class FakeWrapperToolset:
    def __init__(self, wrapped):
        self.wrapped = wrapped

    async def call_tool(self, name, tool_args, ctx, tool):
        return await self.wrapped.call_tool(name, tool_args, ctx, tool)


class FakeInner:
    def __init__(self, values=None, *, ident="mcp-main"):
        self.id = ident
        self.values = list(values or [{"ok": 1}, {"ok": 1}])
        self.calls = 0
        self.run_transitions = 0

    async def for_run(self, ctx):
        self.run_transitions += 1
        return self

    async def call_tool(self, name, tool_args, ctx, tool):
        self.calls += 1
        value = self.values[min(self.calls - 1, len(self.values) - 1)]
        if isinstance(value, BaseException):
            raise value
        return value


class ToolDef:
    def __init__(self, name="read", metadata=None, toolset_id="mcp-main", capability_id="mcp-cap", kind="function"):
        self.name = name
        self.metadata = metadata
        self.toolset_id = toolset_id
        self.capability_id = capability_id
        self.kind = kind


class Tool:
    def __init__(self, tool_def=None):
        self.tool_def = tool_def or ToolDef()


def install_fake_pydantic():
    pydantic_ai = types.ModuleType("pydantic_ai")
    toolsets = types.ModuleType("pydantic_ai.toolsets")
    wrapper = types.ModuleType("pydantic_ai.toolsets.wrapper")
    wrapper.WrapperToolset = FakeWrapperToolset
    sys.modules["pydantic_ai"] = pydantic_ai
    sys.modules["pydantic_ai.toolsets"] = toolsets
    sys.modules["pydantic_ai.toolsets.wrapper"] = wrapper


def uninstall_fake_pydantic():
    for name in ["pydantic_ai.toolsets.wrapper", "pydantic_ai.toolsets", "pydantic_ai"]:
        sys.modules.pop(name, None)


class AmbientPydanticAITests(unittest.TestCase):
    def setUp(self):
        install_fake_pydantic()

    def tearDown(self):
        uninstall_fake_pydantic()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_authoritative_call_runs_once_and_repeat_is_upper_bound(self):
        inner = FakeInner()
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        tool = Tool()
        a = self.run_async(run.call_tool("read", {"x": 1}, object(), tool))
        b = self.run_async(run.call_tool("read", {"x": 1}, object(), tool))
        self.assertEqual(a, {"ok": 1})
        self.assertEqual(b, {"ok": 1})
        self.assertEqual(inner.calls, 2)
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["runs_observed"], 1)
        self.assertEqual(report["exact_unchanged_repeats"], 1)
        self.assertFalse(report["interpretation"]["savings_proven"])
        self.assertFalse(report["interpretation"]["automatic_reuse_authorized"])

    def test_cross_run_coordinates_are_not_shared(self):
        inner = FakeInner(values=[{"ok": 1}] * 4)
        root = ambient_pydantic_ai_toolset(inner)
        tool = Tool()
        run1 = self.run_async(root.for_run(object()))
        self.run_async(run1.call_tool("read", {"x": 1}, object(), tool))
        self.run_async(run1.call_tool("read", {"x": 1}, object(), tool))
        run2 = self.run_async(root.for_run(object()))
        self.run_async(run2.call_tool("read", {"x": 1}, object(), tool))
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["runs_observed"], 2)
        self.assertEqual(report["exact_unchanged_repeats"], 1)
        self.assertFalse(root.seenrelay_ambient["cross_run_coordinates_shared"])

    def test_metadata_and_ids_partition_coordinates(self):
        inner = FakeInner(values=[{"ok": 1}] * 4)
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        self.run_async(run.call_tool("read", {"x": 1}, object(), Tool(ToolDef(metadata={"task": False}, toolset_id="a"))))
        self.run_async(run.call_tool("read", {"x": 1}, object(), Tool(ToolDef(metadata={"task": False}, toolset_id="b"))))
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["exact_repeat_validations"], 0)

    def test_changed_result_is_not_counted_unchanged(self):
        inner = FakeInner(values=[{"ok": 1}, {"ok": 2}])
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        tool = Tool()
        self.run_async(run.call_tool("read", {"x": 1}, object(), tool))
        self.run_async(run.call_tool("read", {"x": 1}, object(), tool))
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["exact_changed_repeats"], 1)
        self.assertEqual(report["exact_unchanged_repeats"], 0)

    def test_non_json_result_refuses_without_changing_result(self):
        marker = object()
        inner = FakeInner(values=[marker])
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        got = self.run_async(run.call_tool("read", {}, object(), Tool()))
        self.assertIs(got, marker)
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["refused_measurements"], 1)

    def test_pydantic_like_model_dump_is_supported_without_retention(self):
        class Model:
            def model_dump(self, **kwargs):
                return {"value": 7}
        inner = FakeInner(values=[Model(), Model()])
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        tool = Tool()
        self.run_async(run.call_tool("read", {}, object(), tool))
        self.run_async(run.call_tool("read", {}, object(), tool))
        self.assertEqual(root.seenrelay_ambient["get_report"]()["exact_unchanged_repeats"], 1)
        self.assertNotIn("value", repr(run.__dict__))

    def test_direct_call_outside_for_run_refuses_measurement(self):
        inner = FakeInner(values=[{"ok": 1}, {"ok": 1}])
        root = ambient_pydantic_ai_toolset(inner)
        tool = Tool()
        self.run_async(root.call_tool("read", {"x": 1}, object(), tool))
        self.run_async(root.call_tool("read", {"x": 1}, object(), tool))
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["runs_observed"], 0)
        self.assertEqual(report["refused_measurements"], 2)
        self.assertEqual(report["exact_repeat_validations"], 0)

    def test_error_propagates_and_is_counted_once(self):
        err = RuntimeError("boom")
        inner = FakeInner(values=[err])
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        with self.assertRaisesRegex(RuntimeError, "boom"):
            self.run_async(run.call_tool("read", {}, object(), Tool()))
        self.assertEqual(inner.calls, 1)
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["authoritative_failures"], 1)
        self.assertEqual(report["calls"], 1)

    def test_inner_for_run_is_delegated_once(self):
        inner = FakeInner()
        root = ambient_pydantic_ai_toolset(inner)
        self.run_async(root.for_run(object()))
        self.assertEqual(inner.run_transitions, 1)

    def test_cancelled_error_propagates_without_failure_accounting(self):
        inner = FakeInner(values=[asyncio.CancelledError()])
        root = ambient_pydantic_ai_toolset(inner)
        run = self.run_async(root.for_run(object()))
        with self.assertRaises(asyncio.CancelledError):
            self.run_async(run.call_tool("read", {}, object(), Tool()))
        report = root.seenrelay_ambient["get_report"]()
        self.assertEqual(report["authoritative_failures"], 0)
        self.assertEqual(report["calls"], 0)

    def test_optional_dependency_is_only_required_when_adapter_is_requested(self):
        uninstall_fake_pydantic()
        with self.assertRaisesRegex(RuntimeError, "requires pydantic-ai"):
            ambient_pydantic_ai_toolset(FakeInner())
        install_fake_pydantic()

    def test_toolset_key_is_explicit_and_no_network_surface_exists(self):
        root = ambient_pydantic_ai_toolset(FakeInner(), toolset_key="github-mcp")
        info = root.seenrelay_ambient
        self.assertEqual(info["toolset_key"], "github-mcp")
        self.assertEqual(info["network_calls_from_shadow"], 0)
        self.assertFalse(info["shared_check_from_shadow"])
        self.assertFalse(info["observe_from_shadow"])
        self.assertFalse(info["active_reuse_enabled"])


if __name__ == "__main__":
    unittest.main()

class AmbientIntegrationCatalogTests(unittest.TestCase):
    def test_python_catalog_names_only_real_exports_and_stays_local(self):
        import seenrelay_ambient as module
        catalog = module.ambient_integration_catalog()
        self.assertEqual(catalog["schema"], "seenrelay-ambient-integration-catalog-v0")
        self.assertEqual(catalog["hosted_operations_added"], 0)
        self.assertFalse(catalog["telemetry_added"])
        self.assertFalse(catalog["automatic_reuse_authorized"])
        for item in catalog["integrations"]:
            self.assertTrue(callable(getattr(module, item["export_name"])))
            self.assertEqual(item["default_mode"], "local-shadow")

    def test_python_catalog_is_defensive_copy(self):
        import seenrelay_ambient as module
        first = module.ambient_integration_catalog()
        first["integrations"].clear()
        second = module.ambient_integration_catalog()
        self.assertEqual(len(second["integrations"]), 4)
