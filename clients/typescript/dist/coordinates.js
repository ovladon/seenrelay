function nonEmptyText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function objectOrEmpty(value, name) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}

function sharedFact(input, scheme, locatorName) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  const fact = {
    subject: nonEmptyText(input.subject, 'subject'),
    predicate: nonEmptyText(input.predicate, 'predicate'),
    source: nonEmptyText(input.source, 'source'),
    locator: Object.freeze({ scheme, value: nonEmptyText(input[locatorName], locatorName) })
  };
  if (input.qualifiers !== undefined) fact.qualifiers = objectOrEmpty(input.qualifiers, 'qualifiers');
  return Object.freeze(fact);
}

/** Local deterministic coordinate for one MCP tools/call shape. It is not a shared fact descriptor. */
export function mcpToolCoordinate({ server, name, arguments: args = {} }) {
  return Object.freeze({ protocol: 'mcp-tools-call-v1', server: nonEmptyText(server, 'server'), name: nonEmptyText(name, 'name'), arguments: objectOrEmpty(args, 'arguments') });
}

/** Local deterministic coordinate for one OpenAPI operation shape. It is not a shared fact descriptor. */
export function openApiOperationCoordinate({ service, operationId, parameters = {}, body } = {}) {
  const coordinate = { protocol: 'openapi-operation-v1', service: nonEmptyText(service, 'service'), operation_id: nonEmptyText(operationId, 'operationId'), parameters: objectOrEmpty(parameters, 'parameters') };
  if (body !== undefined) coordinate.body = body;
  return Object.freeze(coordinate);
}

export function jsonPointerFact(input) { return sharedFact(input, 'json_pointer', 'jsonPointer'); }
export function elementIdFact(input) { return sharedFact(input, 'element_id', 'elementId'); }
export function sourceKeyFact(input) { return sharedFact(input, 'source_key', 'sourceKey'); }
