# SPDX-License-Identifier: MIT
"""gRPC adapter for the local SeenRelay agentgateway ExtMcp shadow processor.

The generated ``ext_mcp_pb2`` modules are produced from agentgateway's public
Apache-2.0 ``ext_mcp.proto``. This adapter always returns Pass and only emits
request metadata needed to correlate the authoritative response locally.
"""

from __future__ import annotations

import argparse
import os
from concurrent import futures
from typing import Any, Mapping

import grpc
from google.protobuf.json_format import MessageToDict
from google.protobuf.struct_pb2 import Struct

import ext_mcp_pb2
import ext_mcp_pb2_grpc

from seenrelay_extmcp_processor import AgentgatewayExtMcpShadow


def _pass_request_result(metadata: Mapping[str, Any]) -> ext_mcp_pb2.McpRequestResult:
    result = ext_mcp_pb2.McpRequestResult()
    getattr(result, "pass").CopyFrom(ext_mcp_pb2.Pass())
    if metadata:
        struct = Struct()
        struct.update(dict(metadata))
        result.metadata.CopyFrom(struct)
    return result


def _pass_response_result() -> ext_mcp_pb2.McpResponseResult:
    result = ext_mcp_pb2.McpResponseResult()
    getattr(result, "pass").CopyFrom(ext_mcp_pb2.Pass())
    return result


class SeenRelayExtMcpServicer(ext_mcp_pb2_grpc.ExtMcpServicer):
    """Pass-through ExtMcp service with local shadow measurements only."""

    def __init__(self, processor: AgentgatewayExtMcpShadow) -> None:
        self.processor = processor

    def CheckRequest(self, request, context):
        del context
        body = request.mcp_request if request.HasField("mcp_request") else None
        metadata = self.processor.check_request(
            method=request.method,
            service_names=request.service_names,
            request_bytes=body,
        )
        return _pass_request_result(metadata)

    def CheckResponse(self, request, context):
        del context
        metadata = MessageToDict(
            request.metadata_context,
            preserving_proto_field_name=True,
        )
        self.processor.check_response(
            method=request.method,
            metadata_context=metadata,
            response_bytes=request.mcp_response,
        )
        return _pass_response_result()


def serve(*, host: str, port: int, include_tools: list[str], max_coordinates: int) -> None:
    processor = AgentgatewayExtMcpShadow(
        include_tools=include_tools,
        max_coordinates=max_coordinates,
    )
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    ext_mcp_pb2_grpc.add_ExtMcpServicer_to_server(
        SeenRelayExtMcpServicer(processor), server
    )
    server.add_insecure_port(f"{host}:{port}")
    server.start()
    try:
        server.wait_for_termination()
    finally:
        server.stop(grace=2)


def _tool_list(raw: str) -> list[str]:
    return [value.strip() for value in raw.split(",") if value.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.getenv("SEENRELAY_EXTMCP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SEENRELAY_EXTMCP_PORT", "50051")))
    parser.add_argument(
        "--tools",
        default=os.getenv("SEENRELAY_EXTMCP_TOOLS", ""),
        help="Comma-separated explicit allowlist of deterministic read-only validation tools.",
    )
    parser.add_argument(
        "--max-coordinates",
        type=int,
        default=int(os.getenv("SEENRELAY_EXTMCP_MAX_COORDINATES", "1000")),
    )
    args = parser.parse_args()
    tools = _tool_list(args.tools)
    if not tools:
        parser.error("--tools must explicitly allow at least one tool")
    serve(
        host=args.host,
        port=args.port,
        include_tools=tools,
        max_coordinates=args.max_coordinates,
    )


if __name__ == "__main__":
    main()
