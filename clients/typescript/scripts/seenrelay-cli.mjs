#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { scanRepository, renderHumanReport } from './scan-lib.mjs';
import { analyzeFleetTraceFile, renderFleetTraceReport } from './fleet-trace-census-lib.mjs';

function help() {
  return `SeenRelay CLI

Usage:
  seenrelay scan [path] [--json]
  seenrelay trace-census <trace.json|trace.jsonl> [--json]

Commands:
  scan          Local-only static prescreen for recurring expensive read-only validation candidates.
  trace-census  Local-only census of exact eligible in-flight overlap from sanitized call traces.

Neither command contacts SeenRelay. Static scan cannot return a USE verdict. Trace census reports pre-activation opportunity, not actual savings.
`;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(help());
  process.exit(0);
}

const command = args[0];
const json = args.includes('--json');
const positional = args.slice(1).filter((arg) => !arg.startsWith('-'));

if (command === 'scan') {
  const root = path.resolve(positional[0] ?? process.cwd());
  const report = await scanRepository(root);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report));
} else if (command === 'trace-census') {
  if (!positional[0]) {
    process.stderr.write(`trace-census requires a trace file\n\n${help()}`);
    process.exit(2);
  }
  const report = await analyzeFleetTraceFile(path.resolve(positional[0]));
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderFleetTraceReport(report));
} else {
  process.stderr.write(`Unknown command: ${command}\n\n${help()}`);
  process.exit(2);
}
