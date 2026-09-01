import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mcpToolCoordinate, openApiOperationCoordinate, jsonPointerFact, elementIdFact, sourceKeyFact } from '../clients/typescript/dist/coordinates.js';

test('coordinate kit separates local call coordinates from shared source-backed facts', () => {
  const mcp = mcpToolCoordinate({ server: 'catalog-prod', name: 'catalog.read', arguments: { id: 42 } });
  assert.deepEqual(mcp, { protocol: 'mcp-tools-call-v1', server: 'catalog-prod', name: 'catalog.read', arguments: { id: 42 } });
  assert.equal('source' in mcp, false); assert.equal('locator' in mcp, false);
  const fact = jsonPointerFact({ subject: 'Product stock', predicate: 'availability.current', source: 'https://api.example.com/products/42', jsonPointer: '/stock', qualifiers: { region: 'eu' } });
  assert.deepEqual(fact.locator, { scheme: 'json_pointer', value: '/stock' });
});

test('TypeScript and Python coordinate builders agree on deterministic vectors', () => {
  const js = { mcp: mcpToolCoordinate({ server: 's', name: 'read', arguments: { id: 1 } }), openapi: openApiOperationCoordinate({ service: 'svc', operationId: 'getThing', parameters: { id: 1 }, body: { view: 'full' } }), pointer: jsonPointerFact({ subject: 'x', predicate: 'x.current', source: 'https://e.test/a', jsonPointer: '/x' }), element: elementIdFact({ subject: 'x', predicate: 'x.current', source: 'https://e.test/a', elementId: 'price' }), key: sourceKeyFact({ subject: 'x', predicate: 'x.current', source: 'https://e.test/a', sourceKey: 'product:42:price' }) };
  const py = JSON.parse(execFileSync('python3', ['-c', String.raw`
import json,sys
sys.path.insert(0,'clients/python')
from seenrelay_coordinates import *
out={'mcp':mcp_tool_coordinate('s','read',{'id':1}),'openapi':openapi_operation_coordinate('svc','getThing',{'id':1},{'view':'full'}),'pointer':json_pointer_fact('x','x.current','https://e.test/a','/x'),'element':element_id_fact('x','x.current','https://e.test/a','price'),'key':source_key_fact('x','x.current','https://e.test/a','product:42:price')}
print(json.dumps(out,sort_keys=True))
`], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }));
  assert.deepEqual(py, js);
});
