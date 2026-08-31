import asyncio
import unittest
from dataclasses import dataclass

from seenrelay_ambient import ambient_langchain_mcp_client


@dataclass
class Request:
    name: str
    args: dict
    server_name: str
    headers: dict | None = None
    runtime: object | None = None

    def with_args(self, args):
        return Request(self.name, args, self.server_name, self.headers, self.runtime)


class Result:
    def __init__(self, value):
        self.value = value

    def model_dump(self, **kwargs):
        return {"content": [{"type": "text", "text": self.value}], "isError": False}


async def run_chain(interceptors, request, base_handler):
    handler = base_handler
    for interceptor in reversed(interceptors):
        current = handler

        async def wrapped(req, _interceptor=interceptor, _handler=current):
            return await _interceptor(req, _handler)

        handler = wrapped
    return await handler(request)


class FakeTool:
    def __init__(self, interceptors, server_name="math", name="add", behavior=None):
        # Preserve the exact list object captured by get_tools(), as LangChain does.
        self.interceptors = interceptors
        self.server_name = server_name
        self.name = name
        self.behavior = behavior or (lambda request: Result(str(sum(request.args.values()))))
        self.authoritative_calls = 0

    async def ainvoke(self, args, *, headers=None, future=False):
        if future:
            class FutureRequest(Request):
                pass
            request = FutureRequest(self.name, args, self.server_name, headers)
            request.future_semantic_field = "future"
        else:
            request = Request(self.name, args, self.server_name, headers)

        async def base_handler(req):
            self.authoritative_calls += 1
            value = self.behavior(req)
            return await value if asyncio.iscoroutine(value) else value

        return await run_chain(self.interceptors, request, base_handler)


class FakeMultiServerMCPClient:
    def __init__(self, interceptors=None, *, delay=0.0, behavior=None):
        self.tool_interceptors = interceptors
        self.delay = delay
        self.behavior = behavior
        self.captured_lists = []
        self.get_tools_active = 0
        self.max_get_tools_active = 0

    async def get_tools(self):
        self.get_tools_active += 1
        self.max_get_tools_active = max(self.max_get_tools_active, self.get_tools_active)
        try:
            if self.delay:
                await asyncio.sleep(self.delay)
            captured = self.tool_interceptors
            self.captured_lists.append(captured)
            return [FakeTool(captured, behavior=self.behavior)]
        finally:
            self.get_tools_active -= 1


class AmbientLangChainTests(unittest.IsolatedAsyncioTestCase):
    async def test_injects_seenrelay_last_and_measures_effective_modified_request(self):
        seen_by_outer = []

        async def outer_modifier(request, handler):
            modified = request.with_args({**request.args, "b": 2})
            seen_by_outer.append(modified.args.copy())
            return await handler(modified)

        raw = FakeMultiServerMCPClient([outer_modifier])
        client = ambient_langchain_mcp_client(raw, max_coordinates=20)
        tools = await client.get_tools()
        tool = tools[0]

        # The client is restored after tool construction, while the tool has
        # closed over a separate list ending in SeenRelay's meter.
        self.assertEqual(raw.tool_interceptors, [outer_modifier])
        self.assertIsNot(raw.captured_lists[0], raw.tool_interceptors)
        self.assertIs(raw.captured_lists[0][0], outer_modifier)
        self.assertEqual(len(raw.captured_lists[0]), 2)

        first = await tool.ainvoke({"a": 1})
        second = await tool.ainvoke({"a": 1})
        self.assertEqual(first.model_dump()["content"][0]["text"], "3")
        self.assertEqual(second.model_dump()["content"][0]["text"], "3")
        self.assertEqual(seen_by_outer, [{"a": 1, "b": 2}, {"a": 1, "b": 2}])
        self.assertEqual(tool.authoritative_calls, 2)

        report = client.get_report()
        self.assertEqual(report["get_tools_generations"], 1)
        self.assertEqual(report["measured_calls"], 2)
        self.assertEqual(report["exact_repeat_validations"], 1)
        self.assertEqual(report["exact_unchanged_repeats"], 1)
        self.assertEqual(report["candidate_tools"][0]["server_name"], "math")
        self.assertTrue(report["interpretation"]["seenrelay_is_injected_last"])
        self.assertEqual(client.seenrelay_ambient["network_calls_from_shadow"], 0)
        self.assertFalse(client.seenrelay_ambient["active_reuse_enabled"])

    async def test_separate_get_tools_generations_never_cross_compare(self):
        raw = FakeMultiServerMCPClient([])
        client = ambient_langchain_mcp_client(raw)
        tool1 = (await client.get_tools())[0]
        tool2 = (await client.get_tools())[0]

        await tool1.ainvoke({"a": 1, "b": 2})
        await tool2.ainvoke({"a": 1, "b": 2})
        report = client.get_report()
        self.assertEqual(report["get_tools_generations"], 2)
        self.assertEqual(report["first_observations"], 2)
        self.assertEqual(report["exact_repeat_validations"], 0)
        self.assertFalse(report["interpretation"]["cross_get_tools_generation_comparison"])
        self.assertEqual({t["generation"] for t in report["tools"]}, {1, 2})

    async def test_concurrent_get_tools_is_serialized_and_does_not_duplicate_injection(self):
        raw = FakeMultiServerMCPClient([], delay=0.02)
        client = ambient_langchain_mcp_client(raw)
        tools_a, tools_b = await asyncio.gather(client.get_tools(), client.get_tools())
        self.assertEqual(raw.max_get_tools_active, 1)
        self.assertEqual(len(raw.captured_lists), 2)
        self.assertEqual([len(x) for x in raw.captured_lists], [1, 1])
        self.assertIsNot(raw.captured_lists[0][0], raw.captured_lists[1][0])
        self.assertEqual(raw.tool_interceptors, [])
        await tools_a[0].ainvoke({"a": 1})
        await tools_b[0].ainvoke({"a": 1})
        self.assertEqual(client.get_report()["get_tools_generations"], 2)

    async def test_unknown_future_request_field_fails_closed_without_behavior_change(self):
        raw = FakeMultiServerMCPClient([])
        client = ambient_langchain_mcp_client(raw)
        tool = (await client.get_tools())[0]
        result = await tool.ainvoke({"a": 1}, future=True)
        self.assertIsInstance(result, Result)
        report = client.get_report()
        self.assertEqual(report["refused_measurements"], 1)
        self.assertEqual(report["measured_calls"], 0)
        self.assertTrue(report["interpretation"]["unknown_request_fields_fail_closed"])

    async def test_non_json_result_fails_closed(self):
        class UnsafeResult:
            pass

        raw = FakeMultiServerMCPClient([], behavior=lambda _: UnsafeResult())
        client = ambient_langchain_mcp_client(raw)
        tool = (await client.get_tools())[0]
        result = await tool.ainvoke({"a": 1})
        self.assertIsInstance(result, UnsafeResult)
        self.assertEqual(client.get_report()["refused_measurements"], 1)
        self.assertEqual(client.get_report()["measured_calls"], 0)

    async def test_handler_failure_propagates_and_is_not_observed(self):
        async def boom(_):
            raise RuntimeError("boom")

        raw = FakeMultiServerMCPClient([], behavior=boom)
        client = ambient_langchain_mcp_client(raw)
        tool = (await client.get_tools())[0]
        with self.assertRaisesRegex(RuntimeError, "boom"):
            await tool.ainvoke({"a": 1})
        report = client.get_report()
        self.assertEqual(report["authoritative_failures"], 1)
        self.assertEqual(report["measured_calls"], 0)
        self.assertEqual(tool.authoritative_calls, 1)

    async def test_headers_partition_coordinates_within_generation(self):
        raw = FakeMultiServerMCPClient([])
        client = ambient_langchain_mcp_client(raw)
        tool = (await client.get_tools())[0]
        await tool.ainvoke({"a": 1}, headers={"x-tenant": "a"})
        await tool.ainvoke({"a": 1}, headers={"x-tenant": "b"})
        report = client.get_report()
        self.assertEqual(report["first_observations"], 2)
        self.assertEqual(report["exact_repeat_validations"], 0)

    async def test_invalid_interceptor_container_and_entries_fail_before_get_tools(self):
        bad_container = FakeMultiServerMCPClient([])
        bad_container.tool_interceptors = object()
        client = ambient_langchain_mcp_client(bad_container)
        with self.assertRaises(TypeError):
            await client.get_tools()

        bad_entry = FakeMultiServerMCPClient([object()])
        client = ambient_langchain_mcp_client(bad_entry)
        with self.assertRaises(TypeError):
            await client.get_tools()

    def test_requires_langchain_shape_without_importing_langchain(self):
        with self.assertRaises(TypeError):
            ambient_langchain_mcp_client(object())

        class GetToolsOnly:
            def get_tools(self):
                return []

        with self.assertRaises(TypeError):
            ambient_langchain_mcp_client(GetToolsOnly())


if __name__ == "__main__":
    unittest.main()
