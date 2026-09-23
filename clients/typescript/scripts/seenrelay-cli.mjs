#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { scanRepository, renderHumanReport } from './scan-lib.mjs';

function help() {
  return `SeenRelay CLI

Usage:
  seenrelay scan [path] [--json]

Commands:
  scan    Local-only static prescreen for recurring expensive read-only validation candidates.

The scan command does not contact SeenRelay, does not modify the target project, and cannot return a USE verdict.
`;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(help());
  process.exit(0);
}

const command = args[0];
if (command !== 'scan') {
  process.stderr.write(`Unknown command: ${command}\n\n${help()}`);
  process.exit(2);
}

const json = args.includes('--json');
const positional = args.slice(1).filter((arg) => !arg.startsWith('-'));
const root = path.resolve(positional[0] ?? process.cwd());
const report = await scanRepository(root);
process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report));
