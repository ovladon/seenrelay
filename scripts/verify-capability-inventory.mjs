import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'docs', 'capability-inventory.v1.json');
const validId = /^[a-z][a-z0-9._-]+$/;
const validPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9_./-]+$/;
const criticalities = new Set(['release-critical', 'supported']);
const statuses = new Set(['active', 'retired']);

export function validateInventory(inventory, readFile = (p) => fs.readFileSync(path.join(root, p), 'utf8')) {
  const errors = [];
  if (!inventory || inventory.schema !== 'seenrelay-public-capability-inventory-v1' || inventory.version !== 1) {
    return ['Unsupported or missing capability inventory schema/version'];
  }
  if (!Array.isArray(inventory.capabilities) || inventory.capabilities.length < 1) return ['No capabilities recorded'];

  const ids = new Set();
  for (const cap of inventory.capabilities) {
    if (!cap || !validId.test(cap.id || '')) { errors.push('Invalid capability ID'); continue; }
    if (ids.has(cap.id)) errors.push('Duplicate ID: ' + cap.id);
    ids.add(cap.id);
    if (!statuses.has(cap.status)) errors.push(cap.id + ': invalid status');
    if (!criticalities.has(cap.criticality)) errors.push(cap.id + ': invalid criticality');
    if (typeof cap.domain !== 'string' || !cap.domain) errors.push(cap.id + ': missing domain');
    if (cap.status === 'retired') {
      if (!cap.superseded_by || !cap.retirement_record) errors.push(cap.id + ': retirement missing replacement/record');
      else {
        if (!validPath.test(cap.retirement_record)) errors.push(cap.id + ': retirement record path unsafe');
        else {
          try { readFile(cap.retirement_record); } catch { errors.push(cap.id + ': retirement record missing'); }
        }
      }
      continue;
    }
    if (!Array.isArray(cap.checks) || !cap.checks.length) {
      errors.push(cap.id + ': active capability lacks structural checks');
      continue;
    }
    for (const check of cap.checks) {
      if (!check || typeof check.path !== 'string' || !validPath.test(check.path)) {
        errors.push(cap.id + ': unsafe/missing check path'); continue;
      }
      if (typeof check.contains !== 'string' || check.contains.length < 3) {
        errors.push(cap.id + ': missing/short expected source marker'); continue;
      }
      try {
        if (!readFile(check.path).includes(check.contains)) errors.push(cap.id + ': marker absent in ' + check.path);
      } catch {
        errors.push(cap.id + ': missing required file ' + check.path);
      }
    }
  }
  return errors;
}

export function compareToBaseline(previous, current) {
  const errors = [];
  if (!previous || previous.schema !== 'seenrelay-public-capability-inventory-v1') return errors;
  const currentById = new Map(current.capabilities.map((c) => [c.id, c]));
  for (const old of previous.capabilities) {
    const now = currentById.get(old.id);
    if (!now) { errors.push('Capability silently removed: ' + old.id); continue; }
    if (old.status === 'active' && now.status === 'retired' && (!now.retirement_record || !now.superseded_by)) {
      errors.push('Retirement without replacement/record: ' + old.id);
    }
    if (old.criticality === 'release-critical' && now.criticality !== 'release-critical') {
      errors.push('Release-critical requirement silently downgraded: ' + old.id);
    }
    if (old.status === 'active' && now.status === 'active' && now.checks.length < old.checks.length && !now.change_record) {
      errors.push('Capability check coverage shrank without change record: ' + old.id);
    }
  }
  return errors;
}

export function readBaseline(baseCommit) {
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) throw Error('Base commit must be an exact 40-character SHA');
  execFileSync('git', ['cat-file', '-e', baseCommit + '^{commit}'], { cwd: root, stdio: 'pipe' });
  try {
    const source = execFileSync('git', ['show', baseCommit + ':docs/capability-inventory.v1.json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe'
    });
    return JSON.parse(source);
  } catch (error) {
    // A first-introduction PR has no previous inventory. Other Git errors must fail.
    const tree = execFileSync('git', ['ls-tree', baseCommit, 'docs/capability-inventory.v1.json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe'
    });
    if (tree.trim() === '') return null;
    throw error;
  }
}

function run() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--base-commit');
  if (index !== -1 && (index + 1 >= args.length || args.length !== 2)) {
    throw Error('Usage: verify-capability-inventory.mjs [--base-commit EXACT_SHA]');
  }
  if (index === -1 && args.length !== 0) throw Error('Unknown options: ' + args.join(' '));
  const inventory = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateInventory(inventory);
  if (index !== -1) {
    const baseline = readBaseline(args[index + 1]);
    if (baseline) errors.push(...compareToBaseline(baseline, inventory));
  }
  if (errors.length) {
    for (const issue of errors) process.stderr.write('CAPABILITY REGRESSION: ' + issue + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('Capability inventory structural gate passed (' + inventory.capabilities.length + ' active/retired IDs).\n');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
