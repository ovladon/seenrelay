import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export { evaluateHostileBenchmark } from '../clients/typescript/dist/economics.js';
import { evaluateHostileBenchmark } from '../clients/typescript/dist/economics.js';

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/evaluate-hostile-benchmark.mjs <benchmark.json>');
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(fs.readFileSync(path, 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluateHostileBenchmark(input), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
