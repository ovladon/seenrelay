"""Deterministic SeenRelay coordinate builders.

MCP/OpenAPI builders produce local call coordinates only.
Shared fact builders require a source-backed stable locator.
"""

_MISSING = object()

def _text(value, name):
    if not isinstance(value, str) or not value.strip(): raise TypeError(f"{name} must be a non-empty string")
    return value.strip()

def _mapping(value, name):
    if value is None: return {}
    if not isinstance(value, dict): raise TypeError(f"{name} must be a dict")
    return value

def mcp_tool_coordinate(server, name, arguments=None):
    return {"protocol": "mcp-tools-call-v1", "server": _text(server, "server"), "name": _text(name, "name"), "arguments": _mapping(arguments, "arguments")}

def openapi_operation_coordinate(service, operation_id, parameters=None, body=_MISSING):
    out = {"protocol": "openapi-operation-v1", "service": _text(service, "service"), "operation_id": _text(operation_id, "operation_id"), "parameters": _mapping(parameters, "parameters")}
    if body is not _MISSING: out["body"] = body
    return out

def _shared_fact(subject, predicate, source, scheme, value, qualifiers=None):
    out = {"subject": _text(subject, "subject"), "predicate": _text(predicate, "predicate"), "source": _text(source, "source"), "locator": {"scheme": scheme, "value": _text(value, "locator")}}
    if qualifiers is not None: out["qualifiers"] = _mapping(qualifiers, "qualifiers")
    return out

def json_pointer_fact(subject, predicate, source, json_pointer, qualifiers=None): return _shared_fact(subject, predicate, source, "json_pointer", json_pointer, qualifiers)
def element_id_fact(subject, predicate, source, element_id, qualifiers=None): return _shared_fact(subject, predicate, source, "element_id", element_id, qualifiers)
def source_key_fact(subject, predicate, source, source_key, qualifiers=None): return _shared_fact(subject, predicate, source, "source_key", source_key, qualifiers)
