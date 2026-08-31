import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ambientMcpClient } from '../clients/typescript/dist/ambient.js';

function fake(results){let i=0;return {async callTool(){return results[Math.min(i++,results.length-1)];},async ping(){return 'pong';}};}

test('zero-config ambient wrapper preserves authoritative behavior and discovers exact unchanged repetition locally',async()=>{
  const raw=fake([{value:1},{value:1}]);
  const client=ambientMcpClient(raw,{serverKey:'demo'});
  const a=await client.callTool({name:'read',arguments:{id:1}});
  const b=await client.callTool({name:'read',arguments:{id:1}});
  assert.deepEqual(a,{value:1});assert.deepEqual(b,{value:1});
  const r=client.seenRelayAmbient.getReport();
  assert.equal(r.shadow_calls,2);assert.equal(r.active_policy_calls,0);
  assert.equal(r.exact_unchanged_repeats,1);
  assert.equal(r.candidate_tools[0].tool,'read');
  assert.equal(r.interpretation.savings_proven,false);
  assert.equal(client.seenRelayAmbient.network_calls_from_shadow,0);
  assert.equal(client.seenRelayAmbient.raw_arguments_retained,false);
  assert.equal(client.seenRelayAmbient.raw_results_retained,false);
});

test('changed repeat is reported rather than called reusable',async()=>{
  const client=ambientMcpClient(fake([{value:1},{value:2}]),{serverKey:'demo'});
  await client.callTool({name:'read',arguments:{id:1}});await client.callTool({name:'read',arguments:{id:1}});
  const r=client.seenRelayAmbient.getReport();
  assert.equal(r.exact_repeat_validations,1);assert.equal(r.exact_changed_repeats,1);assert.equal(r.exact_unchanged_repeats,0);assert.equal(r.candidate_tools.length,0);
});

test('unmodelled call options preserve result and fail closed from shadow comparison',async()=>{
  const client=ambientMcpClient(fake([{value:1}]),{serverKey:'demo'});
  const result=await client.callTool({name:'read',arguments:{id:1}},{signal:'x'});
  assert.deepEqual(result,{value:1});
  const r=client.seenRelayAmbient.getReport();assert.equal(r.refused_measurements,1);assert.equal(r.measured_shadow_calls,0);
});

test('explicit active tool delegates to existing protectMcpClient path and is excluded from shadow savings metrics',async()=>{
  let calls=0;
  const raw={async callTool(){calls++;return {value:1};}};
  const client=ambientMcpClient(raw,{serverKey:'demo',tools:{read:{maxAgeMs:60_000}}});
  await client.callTool({name:'read',arguments:{id:1}});await client.callTool({name:'read',arguments:{id:1}});
  const r=client.seenRelayAmbient.getReport();
  assert.equal(calls,1);assert.equal(r.active_policy_calls,2);assert.equal(r.shadow_calls,0);assert.equal(r.exact_unchanged_repeats,0);
  const telemetry=client.seenRelayAmbient.getTelemetry();assert.equal(telemetry.guard.protectedCalls,2);
});

test('ambient wrapper preserves unrelated methods',async()=>{
  const client=ambientMcpClient(fake([{value:1}]),{serverKey:'demo'});assert.equal(await client.ping(),'pong');
});

test('package exposes ambient entry point without adding hosted operations',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../clients/typescript/package.json',import.meta.url),'utf8'));
  assert.equal(pkg.exports['./ambient'].import,'./dist/ambient.js');
  const src=fs.readFileSync(new URL('../clients/typescript/dist/ambient.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\/v1\/(check|observe)/i);
});

import { ambientOpenAIAgentsMcpServer, ambientAiSdkMcpTools } from '../clients/typescript/dist/ambient.js';

test('OpenAI Agents adapter is one-line shadow by default and preserves callTool signature',async()=>{
  const calls=[];
  const server={name:'docs',async callTool(name,args,meta,options){calls.push([name,args,meta,options]);return {content:[{type:'text',text:'ok'}]};},async close(){return 'closed';}};
  const ambient=ambientOpenAIAgentsMcpServer(server);
  const a=await ambient.callTool('search',{q:'x'});const b=await ambient.callTool('search',{q:'x'});
  assert.equal(calls.length,2);assert.deepEqual(a,b);assert.equal(await ambient.close(),'closed');
  const r=ambient.seenRelayAmbient.getReport().callTool;
  assert.equal(r.exact_unchanged_repeats,1);assert.equal(r.interpretation.automatic_reuse_authorized,false);
});

test('OpenAI Agents adapter refuses shadow equivalence when meta/options are present but preserves them exactly',async()=>{
  let seen;
  const server={name:'docs',async callTool(...args){seen=args;return {ok:true};}};
  const ambient=ambientOpenAIAgentsMcpServer(server);
  const meta={trace:'x'},options={timeout:1};
  await ambient.callTool('search',{q:'x'},meta,options);
  assert.equal(seen[2],meta);assert.equal(seen[3],options);
  const r=ambient.seenRelayAmbient.getReport().callTool;assert.equal(r.refused_measurements,1);
});

test('OpenAI Agents adapter supports callToolResult as an independent completed-call boundary',async()=>{
  const server={name:'docs',async callTool(){return {content:[]};},async callToolResult(){return {content:[],structuredContent:{x:1}};}};
  const ambient=ambientOpenAIAgentsMcpServer(server);
  await ambient.callToolResult('read',{id:1});await ambient.callToolResult('read',{id:1});
  const report=ambient.seenRelayAmbient.getReport();assert.equal(report.callToolResult.exact_unchanged_repeats,1);
});

test('AI SDK MCP tool-set adapter preserves tool objects and shadows exact calls only when execution options are absent',async()=>{
  let calls=0;const tool={description:'x',async execute(input){calls++;return {input};}};
  const ambient=ambientAiSdkMcpTools({read:tool},{serverKey:'ai'});
  assert.equal(ambient.tools.read.description,'x');
  await ambient.tools.read.execute({id:1});await ambient.tools.read.execute({id:1});
  assert.equal(calls,2);
  assert.equal(ambient.seenRelayAmbient.getReport().tools.read.exact_unchanged_repeats,1);
});

test('AI SDK execution options are preserved and conservatively excluded from equivalence',async()=>{
  let seen;const tool={async execute(input,options){seen=options;return {input};}};const ambient=ambientAiSdkMcpTools({read:tool});const options={toolCallId:'1'};
  await ambient.tools.read.execute({id:1},options);assert.equal(seen,options);assert.equal(ambient.seenRelayAmbient.getReport().tools.read.refused_measurements,1);
});
