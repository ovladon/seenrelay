from __future__ import annotations

import json
from concurrent import futures
from pathlib import Path
import sys
import unittest

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import grpc
from google.protobuf.struct_pb2 import Struct

import ext_mcp_pb2
import ext_mcp_pb2_grpc

from seenrelay_extmcp_processor import AgentgatewayExtMcpShadow
from seenrelay_extmcp_server import SeenRelayExtMcpServicer


class AgentgatewayExtMcpCompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.processor = AgentgatewayExtMcpShadow(include_tools=["validate_price"])
        self.server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
        ext_mcp_pb2_grpc.add_ExtMcpServicer_to_server(
            SeenRelayExtMcpServicer(self.processor), self.server
        )
        port = self.server.add_insecure_port("127.0.0.1:0")
        self.server.start()
        self.channel = grpc.insecure_channel(f"127.0.0.1:{port}")
        self.stub = ext_mcp_pb2_grpc.ExtMcpStub(self.channel)

    def tearDown(self) -> None:
        self.channel.close()
        self.server.stop(grace=0).wait()

    def _request(self, *, tool: str, arguments: dict) -> ext_mcp_pb2.McpRequestResult:
        return self.stub.CheckRequest(
            ext_mcp_pb2.McpRequest(
                service_names=["inventory"],
                method="tools/call",
                mcp_request=json.dumps(
                    {"name": tool, "arguments": arguments},
                    separators=(",", ":"),
                ).encode(),
            )
        )

    def _response(self, metadata: Struct, result: dict) -> ext_mcp_pb2.McpResponseResult:
        return self.stub.CheckResponse(
            ext_mcp_pb2.McpResponse(
                service_names=["inventory"],
                method="tools/call",
                metadata_context=metadata,
                mcp_response=json.dumps(result, separators=(",", ":")).encode(),
            )
        )

    def test_allowlisted_repeat_is_measured_without_mutation(self) -> None:
        first_req = self._request(tool="validate_price", arguments={"sku": "A-1"})
        self.assertEqual(first_req.WhichOneof("result"), "pass")
        self.assertTrue(first_req.metadata.fields)
        first_resp = self._response(first_req.metadata, {"price": 12})
        self.assertEqual(first_resp.WhichOneof("result"), "pass")

        second_req = self._request(tool="validate_price", arguments={"sku": "A-1"})
        second_resp = self._response(second_req.metadata, {"price": 12})
        self.assertEqual(second_resp.WhichOneof("result"), "pass")

        report = self.processor.get_report()
        self.assertEqual(report["totals"]["eligible_requests"], 2)
        self.assertEqual(report["totals"]["measured_responses"], 2)
        self.assertEqual(report["totals"]["repeats"], 1)
        self.assertEqual(report["totals"]["unchanged"], 1)
        self.assertEqual(report["totals"]["changed"], 0)
        self.assertEqual(report["hosted_operations"], 0)
        self.assertFalse(report["automatic_reuse_authorized"])

    def test_changed_authoritative_result_is_preserved_and_classified(self) -> None:
        req1 = self._request(tool="validate_price", arguments={"sku": "A-1"})
        self._response(req1.metadata, {"price": 12})
        req2 = self._request(tool="validate_price", arguments={"sku": "A-1"})
        self._response(req2.metadata, {"price": 13})
        report = self.processor.get_report()
        self.assertEqual(report["totals"]["repeats"], 1)
        self.assertEqual(report["totals"]["changed"], 1)
        self.assertEqual(report["totals"]["unchanged"], 0)

    def test_non_allowlisted_tool_passes_without_measurement_metadata(self) -> None:
        req = self._request(tool="delete_record", arguments={"id": 7})
        self.assertEqual(req.WhichOneof("result"), "pass")
        self.assertFalse(req.metadata.fields)
        self.assertEqual(self.processor.get_report()["totals"]["eligible_requests"], 0)

    def test_invalid_request_passes_without_measurement(self) -> None:
        result = self.stub.CheckRequest(
            ext_mcp_pb2.McpRequest(
                service_names=["inventory"],
                method="tools/call",
                mcp_request=b"not-json",
            )
        )
        self.assertEqual(result.WhichOneof("result"), "pass")
        self.assertFalse(result.metadata.fields)
        self.assertEqual(self.processor.get_report()["totals"]["refused"], 1)

    def test_raw_values_are_not_retained_in_report(self) -> None:
        raw_argument = "ARGUMENT-DO-NOT-RETAIN"
        raw_result = "RESULT-DO-NOT-RETAIN"
        req = self._request(tool="validate_price", arguments={"secret": raw_argument})
        self._response(req.metadata, {"secret": raw_result})
        serialized = json.dumps(self.processor.get_report(), sort_keys=True)
        self.assertNotIn(raw_argument, serialized)
        self.assertNotIn(raw_result, serialized)
        self.assertFalse(self.processor.get_report()["raw_requests_retained"])
        self.assertFalse(self.processor.get_report()["raw_responses_retained"])

    def test_coordinate_state_is_bounded(self) -> None:
        processor = AgentgatewayExtMcpShadow(
            include_tools=["validate_price"], max_coordinates=2
        )
        for index in range(3):
            metadata = processor.check_request(
                method="tools/call",
                service_names=["inventory"],
                request_bytes=json.dumps(
                    {"name": "validate_price", "arguments": {"id": index}}
                ).encode(),
            )
            processor.check_response(
                method="tools/call",
                metadata_context=metadata,
                response_bytes=json.dumps({"value": index}).encode(),
            )
        self.assertEqual(processor.get_report()["coordinates_retained"], 2)


if __name__ == "__main__":
    unittest.main()
