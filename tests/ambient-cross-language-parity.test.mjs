import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { ambientMcpClient } from '../clients/typescript/dist/ambient.js';

function core(report){
  return {
    schema: report.schema,
    calls: report.calls,
    shadow_calls: report.shadow_calls,
    active_policy_calls: report.active_policy_calls,
    measured_shadow_calls: report.measured_shadow_calls,
    exact_repeat_validations: report.exact_repeat_validations,
    exact_unchanged_repeats: report.exact_unchanged_repeats,
    exact_changed_repeats: report.exact_changed_repeats,
    refused_measurements: report.refused_measurements,
    candidate_tools: report.candidate_tools.map(x=>({tool:x.tool,calls:x.calls,measured_calls:x.measured_calls,first_observations:x.first_observations,exact_repeat_validations:x.exact_repeat_validations,exact_unchanged_repeats:x.exact_unchanged_repeats,exact_changed_repeats:x.exact_changed_repeats,refused_measurements:x.refused_measurements})),
    interpretation: {
      savings_proven: report.interpretation.savings_proven,
      native_controls_measured: report.interpretation.native_controls_measured,
      relay_check_overhead_measured: report.interpretation.relay_check_overhead_measured,
      automatic_reuse_authorized: report.interpretation.automatic_reuse_authorized,
      public_claim_authorized: report.interpretation.public_claim_authorized,
      exact_repetition_only: report.interpretation.exact_repetition_only,
      next_step: report.interpretation.next_step
    }
  };
}

test('TypeScript and Python ambient default shadow semantics agree on deterministic vectors',async()=>{
  let i=0;const values=[{v:1},{v:1},{v:2},{v:2}];
  const ts=ambientMcpClient({async callTool(){return values[i++];}},{serverKey:'parity'});
  await ts.callTool({name:'read',arguments:{id:1}});
  await ts.callTool({name:'read',arguments:{id:1}});
  await ts.callTool({name:'read',arguments:{id:1}});
  await ts.callTool({name:'other',arguments:{id:2}});
  const py=JSON.parse(execFileSync('python3',['-c',String.raw`
import asyncio,json,sys
sys.path.insert(0,'clients/python')
from seenrelay_ambient import ambient_mcp_client
class C:
  def __init__(self): self.values=[{'v':1},{'v':1},{'v':2},{'v':2}];self.i=0
  async def call_tool(self,name,arguments=None):
    v=self.values[self.i];self.i+=1;return v
async def main():
  c=ambient_mcp_client(C(),server_key='parity')
  await c.call_tool('read',{'id':1});await c.call_tool('read',{'id':1});await c.call_tool('read',{'id':1});await c.call_tool('other',{'id':2})
  print(json.dumps(c.get_report()))
asyncio.run(main())
`],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
  assert.deepEqual(core(ts.seenRelayAmbient.getReport()),core(py));
});
