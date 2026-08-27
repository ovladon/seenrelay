import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const src = path.join(root.pathname, 'src');
const files = fs.readdirSync(src).filter((f) => f.endsWith('.ts'));
const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(src, file), 'utf8');
  if (/\bawait\s+fetch\s*\(/.test(text) || /\bglobalThis\.fetch\s*\(/.test(text)) offenders.push(file);
}
if (offenders.length) throw new Error(`Outbound fetch is forbidden in application logic: ${offenders.join(', ')}`);

const env = fs.readFileSync(path.join(root.pathname, '.env.example'), 'utf8');
if (!/^PAYMENTS_ENABLED=false$/m.test(env)) throw new Error('PAYMENTS_ENABLED must default to false');
if (!/^PAYMENT_PROVIDER=none$/m.test(env)) throw new Error('PAYMENT_PROVIDER must default to none');
const billing = fs.readFileSync(path.join(src, 'billing.ts'), 'utf8');
if (!/Billing is disabled in this SeenRelay deployment/.test(billing)) throw new Error('Billing-disabled fail-closed guard missing');

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root.pathname, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const sensitiveNamePatterns = [
  /(?:^|\/).*recovery.*codes.*$/i,
  /(?:^|\/).*\.secrets?$/i,
  /(?:^|\/)private\//i,
  /(?:^|\/)backup\//i,
  /^[^/]+\.zip$/i,
];
const trackedSensitive = tracked.filter((file) => sensitiveNamePatterns.some((pattern) => pattern.test(file)));
if (trackedSensitive.length) {
  throw new Error(`Sensitive/recovery artifact must not be tracked: ${trackedSensitive.join(', ')}`);
}

console.log('Guardrails OK: no outbound fact research; billing is disabled and fail-closed; no tracked local recovery artifacts.');
