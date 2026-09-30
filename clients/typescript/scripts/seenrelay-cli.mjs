#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { scanRepository, renderHumanReport } from './scan-lib.mjs';
import { buildAdoptionPlan, renderAdoptionPlan } from './adoption-plan-lib.mjs';
import { analyzeFleetTraceFile, renderFleetTraceReport } from './fleet-trace-census-lib.mjs';
import { analyzeOtelFleetTraceFile } from './otel-trace-census-lib.mjs';
import { analyzeLangfuseObservationsFile, renderLangfuseCensusReport } from './langfuse-census-lib.mjs';

function help() {
  return `SeenRelay CLI

Usage:
  seenrelay scan [path] [--json]
  seenrelay adopt-plan [path] [--json]
  seenrelay trace-census <trace.json|trace.jsonl> [--json]
  seenrelay otel-trace-census <otlp.json> [--json]
  seenrelay langfuse-census <observations.json|observations.jsonl> [--json]

Commands:
  scan               Local-only static prescreen for recurring expensive read-only validation candidates.
  adopt-plan         Local-only machine-readable next action derived from the static prescreen; never modifies code or enables reuse.
  trace-census       Local-only census of exact eligible in-flight overlap from sanitized call traces.
  otel-trace-census  Local-only adapter from OTLP/JSON spans into the same conservative census.
  langfuse-census    Local-only candidate census over exported Langfuse TOOL observations.

None of these commands contacts SeenRelay. Static scan cannot return a USE verdict. Trace and Langfuse census report pre-activation opportunity, not actual savings.
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
} else if (command === 'adopt-plan') {
  const root = path.resolve(positional[0] ?? process.cwd());
  const scan = await scanRepository(root);
  const plan = buildAdoptionPlan(scan);
  process.stdout.write(json ? `${JSON.stringify(plan, null, 2)}\n` : renderAdoptionPlan(plan));
} else if (command === 'trace-census') {
  if (!positional[0]) {
    process.stderr.write(`trace-census requires a trace file\n\n${help()}`);
    process.exit(2);
  }
  const report = await analyzeFleetTraceFile(path.resolve(positional[0]));
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderFleetTraceReport(report));
} else if (command === 'otel-trace-census') {
  if (!positional[0]) {
    process.stderr.write(`otel-trace-census requires an OTLP JSON file\n\n${help()}`);
    process.exit(2);
  }
  const report = await analyzeOtelFleetTraceFile(path.resolve(positional[0]));
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderFleetTraceReport(report));
} else if (command === 'langfuse-census') {
  if (!positional[0]) {
    process.stderr.write(`langfuse-census requires a Langfuse observations export\n\n${help()}`);
    process.exit(2);
  }
  const report = await analyzeLangfuseObservationsFile(path.resolve(positional[0]));
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderLangfuseCensusReport(report));
} else {
  process.stderr.write(`Unknown command: ${command}\n\n${help()}`);
  process.exit(2);
}
