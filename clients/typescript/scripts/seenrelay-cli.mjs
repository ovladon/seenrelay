#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { scanRepository, renderHumanReport } from './scan-lib.mjs';
import { fetchStarterCatalog, runStarterCheck, renderStarterCheck, renderStarterCatalog } from './starter-check-lib.mjs';

function help() {
  return `SeenRelay CLI

Usage:
  seenrelay scan [path] [--json]
  seenrelay check-starter --list [--json]\n  seenrelay check-starter <fact-id> --known <value> --max-age <seconds> [--json]

Commands:
  scan           Local-only static prescreen for recurring expensive read-only validation candidates.
  check-starter  Ask existing SeenRelay CHECK about one canonical starter fact you already know.

Boundaries:
  scan does not contact SeenRelay, modify the target project, or return a USE verdict.
  check-starter is evidence-only: it does not fetch the authoritative answer, choose a freshness window,
  authorize reuse, or add a third SeenRelay protocol operation.
`;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index === args.length - 1) return undefined;
  return args[index + 1];
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(help());
  process.exit(0);
}

const command = args[0];
if (command === 'scan') {
  const json = args.includes('--json');
  const positional = args.slice(1).filter((arg, index, all) => {
    if (arg.startsWith('-')) return false;
    const previous = all[index - 1];
    return previous !== '--origin' && previous !== '--known' && previous !== '--max-age';
  });
  const root = path.resolve(positional[0] ?? process.cwd());
  const report = await scanRepository(root);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderHumanReport(report));
  process.exit(0);
}

if (command === 'check-starter') {
  const origin = optionValue(args, '--origin') || 'https://seenrelay.com';
  const json = args.includes('--json');

  if (args.includes('--list')) {
    try {
      const { catalog } = await fetchStarterCatalog({ origin });
      process.stdout.write(json ? `${JSON.stringify(catalog, null, 2)}\n` : renderStarterCatalog(catalog));
      process.exit(0);
    } catch (error) {
      process.stderr.write(`SeenRelay check-starter failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(2);
    }
  }

  const factId = args[1] && !args[1].startsWith('-') ? args[1] : '';
  const knownValue = optionValue(args, '--known');
  const maxAgeSeconds = optionValue(args, '--max-age');
  try {
    const result = await runStarterCheck({
      factId,
      knownValue,
      maxAgeSeconds,
      origin
    });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : renderStarterCheck(result));
    process.exit(0);
  } catch (error) {
    process.stderr.write(`SeenRelay check-starter failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

process.stderr.write(`Unknown command: ${command}\n\n${help()}`);
process.exit(2);
