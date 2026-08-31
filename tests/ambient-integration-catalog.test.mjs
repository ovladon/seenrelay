import test from 'node:test';
import assert from 'node:assert/strict';
import {getAmbientIntegrationCatalog} from '../clients/typescript/dist/ambient.js';

test('Ambient integration catalog is local capability metadata only',()=>{const c=getAmbientIntegrationCatalog();assert.equal(c.schema,'seenrelay-ambient-integration-catalog-v0');assert.equal(c.hosted_operations_added,0);assert.equal(c.telemetry_added,false);assert.equal(c.automatic_reuse_authorized,false);});
test('JS catalog names only exports present in the Ambient module',async()=>{const m=await import('../clients/typescript/dist/ambient.js');for(const x of getAmbientIntegrationCatalog().integrations)assert.equal(typeof m[x.export_name],'function',x.export_name);});
test('JS catalog declares conservative default modes',()=>{for(const x of getAmbientIntegrationCatalog().integrations)assert.equal(x.default_mode,'local-shadow');});
test('JS catalog does not claim active reuse for framework-owned execution surfaces',()=>{const by=new Map(getAmbientIntegrationCatalog().integrations.map(x=>[x.id,x]));assert.equal(by.get('ai-sdk.mcp-tools-js.v0').active_reuse_available,false);assert.equal(by.get('langchain.mcp-hooks-js.v0').active_reuse_available,false);});
