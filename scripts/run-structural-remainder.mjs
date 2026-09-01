import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { TARGET_TESTS } from './fleet-wrapper-shadow.mjs';

export function structuralRemainder({ directory = 'tests' } = {}) {
  const excluded = new Set(TARGET_TESTS);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => `${directory}/${entry.name}`)
    .filter((path) => !excluded.has(path))
    .sort();
}

export function runStructuralRemainder({ files = structuralRemainder() } = {}) {
  if (files.length === 0) throw new Error('structural remainder is empty');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`structural remainder failed: code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runStructuralRemainder();
}
