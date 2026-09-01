export interface SharedFactBase { subject: string; predicate: string; source: string; qualifiers?: Record<string, unknown>; }
export declare function mcpToolCoordinate(input: { server: string; name: string; arguments?: Record<string, unknown>; }): Readonly<{ protocol: 'mcp-tools-call-v1'; server: string; name: string; arguments: Record<string, unknown>; }>;
export declare function openApiOperationCoordinate(input: { service: string; operationId: string; parameters?: Record<string, unknown>; body?: unknown; }): Readonly<{ protocol: 'openapi-operation-v1'; service: string; operation_id: string; parameters: Record<string, unknown>; body?: unknown; }>;
export declare function jsonPointerFact(input: SharedFactBase & { jsonPointer: string }): Readonly<SharedFactBase & { locator: Readonly<{ scheme: 'json_pointer'; value: string }> }>;
export declare function elementIdFact(input: SharedFactBase & { elementId: string }): Readonly<SharedFactBase & { locator: Readonly<{ scheme: 'element_id'; value: string }> }>;
export declare function sourceKeyFact(input: SharedFactBase & { sourceKey: string }): Readonly<SharedFactBase & { locator: Readonly<{ scheme: 'source_key'; value: string }> }>;
