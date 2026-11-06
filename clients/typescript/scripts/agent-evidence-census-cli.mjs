#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import {analyzeAgentEvidenceFile,renderAgentEvidenceReport} from './agent-evidence-census-lib.mjs';

const argv=process.argv.slice(2);
if(argv.includes('--help')||argv.includes('-h')||argv.length===0){
 process.stdout.write([
  'SeenRelay Delta Agent Evidence Census (local-only, shadow-only)',
  'Usage: node clients/typescript/scripts/agent-evidence-census-cli.mjs <sanitized-evidence.json> [--json]',
  'No remote calls, active reuse, or customer savings claims.',''
 ].join('\n'));
 process.exit(0);
}
const positional=argv.filter(x=>x!=='--json');
if(positional.length!==1||positional[0].startsWith('-')){
 process.stderr.write('Expected exactly one sanitized evidence JSON file\n');process.exit(2);
}
const report=analyzeAgentEvidenceFile(path.resolve(positional[0]));
process.stdout.write(argv.includes('--json')?JSON.stringify(report,null,2)+'\n':renderAgentEvidenceReport(report));
