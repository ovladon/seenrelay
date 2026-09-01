# Fact Coordinate Kit v1

SeenRelay benefits only when independent integrations describe the same validation target deterministically. The coordinate kit reduces accidental fragmentation without semantic inference.

It deliberately does **not** browse, call an LLM, merge natural-language aliases, or turn arbitrary tool calls into shared facts.

## Local call coordinates

Local coordinates identify repeated application/tool calls for in-process or caller-owned reuse.

```js
import { mcpToolCoordinate, openApiOperationCoordinate } from 'seenrelay/coordinates';
const mcp = mcpToolCoordinate({ server: 'catalog-prod', name: 'catalog.read', arguments: { id: 42 } });
const api = openApiOperationCoordinate({ service: 'catalog-api', operationId: 'getProduct', parameters: { id: 42 } });
```

Python exposes `mcp_tool_coordinate(...)` and `openapi_operation_coordinate(...)`.

These objects are local coordinates only. They are not automatically OBSERVE-eligible shared facts.

## Shared source-backed fact coordinates

Use a shared fact only when the validation target has a stable source and stable source-native locator.

Supported builders:

- `jsonPointerFact(...)` / `json_pointer_fact(...)`
- `elementIdFact(...)` / `element_id_fact(...)`
- `sourceKeyFact(...)` / `source_key_fact(...)`

```js
import { jsonPointerFact } from 'seenrelay/coordinates';
const fact = jsonPointerFact({ subject: 'Product 42 stock', predicate: 'availability.current', source: 'https://api.example.com/products/42', jsonPointer: '/stock' });
```

Server-side fact identity still applies the versioned SeenRelay canonicalization contract. The kit does not duplicate or weaken URL credential rejection, query normalization, qualifier handling or fact-key construction.

## Safety rule

Prefer fragmentation to false convergence. If two integrations cannot derive the same coordinate from stable machine/source identifiers, do not guess that they refer to the same fact.
