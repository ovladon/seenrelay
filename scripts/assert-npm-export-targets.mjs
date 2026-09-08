#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const packageDir = path.resolve(process.argv[2] || 'clients/typescript');
const packageJsonPath = path.join(packageDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

function collectTargets(value, label, out) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) out.push({ label, target: value });
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    collectTargets(nested, `${label}.${key}`, out);
  }
}

const targets = [];
if (typeof pkg.main === 'string') targets.push({ label: 'main', target: pkg.main });
if (typeof pkg.types === 'string') targets.push({ label: 'types', target: pkg.types });
collectTargets(pkg.exports, 'exports', targets);

if (!targets.length) {
  console.error(`No package entry targets found in ${packageJsonPath}`);
  process.exit(1);
}

const missing = [];
for (const { label, target } of targets) {
  const resolved = path.resolve(packageDir, target);
  const relative = path.relative(packageDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    missing.push(`${label}: ${target} escapes package root`);
    continue;
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    missing.push(`${label}: ${target} does not exist`);
    continue;
  }
  if (!stat.isFile()) missing.push(`${label}: ${target} is not a file`);
}

if (missing.length) {
  console.error('Invalid npm package entry targets:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}
