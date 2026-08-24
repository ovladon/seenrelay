import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('product exposes exactly two core domain operations', () => {
  const source = read('src','index.ts');
  assert.match(source, /\/v1\/check/);
  assert.match(source, /\/v1\/observe/);
  assert.doesNotMatch(source, /\/v1\/verify/);
});

test('service implementation contains no outbound fact-research fetch', () => {
  const src = path.join(root, 'src');
  const offenders = fs.readdirSync(src).filter((f) => f.endsWith('.ts')).filter((file) => {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    return /\bawait\s+fetch\s*\(/.test(text) || /\bglobalThis\.fetch\s*\(/.test(text);
  });
  assert.deepEqual(offenders, []);
});

test('billing is disabled and fails closed', () => {
  assert.match(read('.env.example'), /^PAYMENTS_ENABLED=false$/m);
  assert.match(read('.env.example'), /^PAYMENT_PROVIDER=none$/m);
  assert.match(read('src','billing.ts'), /Billing is disabled in this SeenRelay deployment/);
  assert.match(read('src','strategic.ts'), /billing remains disabled in this deployment/i);
});

test('version and idempotency scope are internally consistent', () => {
  const config = read('src','config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(config, new RegExp(`SERVICE_VERSION \\|\\| ['\"]${pkg.version}['\"]`));
  const service = read('src','service.ts');
  assert.match(service, /idem\|\$\{fact\.factKey\}\|\$\{observer\.key\}\|\$\{idempotency\}/);
});

test('fact identity v3 excludes mutable source content from identity', () => {
  const canonical = read('src','canonical.ts');
  assert.match(canonical, /seenrelay-fact-v3/);
  assert.match(canonical, /const discriminator = locator/);
  assert.match(canonical, /locator:/);
  assert.match(canonical, /predicate:/);
  assert.match(canonical, /const canonical = `\$\{identityVersion\}\\n\$\{sourceUrl\}\\n\$\{discriminator\}\\n\$\{qualifiersJson\}`/);
  assert.doesNotMatch(canonical, /source_fragment_sha256/);
  assert.doesNotMatch(canonical, /anchor:/);
  assert.match(canonical, /utm_/);
  assert.match(canonical, /must not contain authentication or signature query parameters/);
  assert.doesNotMatch(canonical, /localeCompare/);
});

test('REST and MCP validate fact identity before stateful Hive admission', () => {
  const index = read('src','index.ts');
  const mcp = read('src','mcp.ts');
  for (const [name, text] of [['REST', index], ['MCP', mcp]]) {
    const canonical = text.indexOf('canonicalFact(');
    const admission = text.indexOf('admitHive(');
    assert.ok(canonical >= 0 && admission > canonical, `${name} must canonicalize before Hive admission`);
  }
});

test('canonical product documentation cannot regress to fact-v2 or mutable anchors', () => {
  for (const file of ['README.md','docs/PROTOCOL.md','docs/PROJECT_CONTEXT.md','docs/DECISIONS.md','docs/HANDOFF.md']) {
    const text = read(...file.split('/'));
    assert.match(text, /seenrelay-fact-v3|fact identity v3|Fact identity v3/i, `${file} must describe fact-v3`);
    assert.doesNotMatch(text, /seenrelay-fact-v2|source_fragment_sha256/, `${file} contains retired identity language`);
  }
});

test('observer provenance supports Ed25519 proof-of-possession without claiming real-world identity', () => {
  const identity = read('src','identity.ts');
  const service = read('src','service.ts');
  assert.match(identity, /Ed25519/);
  assert.match(identity, /crypto\.subtle\.verify/);
  assert.match(identity, /proof_of_possession/);
  assert.match(identity, /seenrelay-observe-proof-v1/);
  assert.match(identity, /x-forwarded-for/);
  assert.match(identity, /deriveReuseIndependenceKey/);
  assert.match(service, /not proof of independent real-world actors/i);
});

test('freshness evidence separates cryptographic and unverified observer keys', () => {
  const db = read('src','db.ts');
  const service = read('src','service.ts');
  assert.match(db, /cryptographic_observers/);
  assert.match(db, /unverified_observers/);
  assert.match(service, /recent_cryptographic_observer_keys/);
  assert.match(service, /recent_unverified_observer_keys/);
});

test('Hive rewards require conservative independence and freeze precedes stateful admission', () => {
  const hive = read('src','hive.ts');
  const reuse = read('src','reuse.ts');
  const migration = read('migrations','0002_hive.sql');
  const hardening = read('migrations','0004_reuse_independence.sql');
  assert.match(hive, /HMAC/);
  assert.match(hive, /x-seenrelay-lease/);
  assert.match(hive, /consumeHiveCheck/);
  assert.match(hive, /creditUsefulReuseGuarded/);
  assert.match(hive, /bindHiveIndependenceKey/);
  assert.match(hive, /recordHiveMetric\('USEFUL_REUSE', 1/);
  assert.match(reuse, /c\.independence_key <> u\.independence_key/);
  assert.doesNotMatch(reuse, /c\.client_key <> u\.client_key/);
  assert.match(reuse, /dailyAwardCap/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hive_leases/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS useful_reuse_events/);
  assert.match(hardening, /independence_key/);
  const policy = hive.indexOf("const policy = await runtimePolicy(operation)");
  const disabled = hive.indexOf("if (!policy.allowed)");
  const stateful = hive.indexOf("const ensured = await ensureLease");
  assert.ok(policy >= 0 && disabled > policy && stateful > disabled, 'runtime disable must be checked before stateful Hive admission');
});

test('credential handoff supports verification-only previous keys', () => {
  const hive = read('src','hive.ts');
  const admin = read('src','admin.ts');
  const env = read('.env.example');
  assert.match(env, /^HIVE_SIGNING_SECRET_PREVIOUS=$/m);
  assert.match(env, /^ADMIN_SECRET_PREVIOUS=$/m);
  assert.match(hive, /previousVerificationKeyActive/);
  assert.match(hive, /verified\.key === 'current'/);
  assert.match(admin, /previousAuthenticationKeyActive/);
  assert.match(admin, /credential_generation/);
  assert.match(read('docs','OPERATIONS_TRANSFER.md'), /make-before-break|grace/i);
});

test('human admin plane is isolated from MCP and has circuit-breaker and operations-export surfaces', () => {
  const index = read('src','index.ts');
  const mcp = read('src','mcp.ts');
  const admin = read('src','admin.ts');
  const migration = read('migrations','0003_admin.sql');
  assert.match(index, /\/admin\/api\/snapshot/);
  assert.match(index, /\/admin\/api\/operations-export/);
  assert.doesNotMatch(mcp, /admin/i);
  assert.match(admin, /SHIELD/);
  assert.match(admin, /READ_ONLY/);
  assert.match(admin, /FREEZE/);
  assert.match(admin, /SameSite=Strict/);
  assert.match(admin, /No secrets/);
  assert.match(migration, /runtime_controls/);
  assert.match(migration, /admin_audit_events/);
});

test('public surface is dual human-machine and exposes only aggregate network stats', () => {
  const index = read('src','index.ts');
  const publicSource = read('src','public.ts');
  const stats = read('src','public-db.ts');
  assert.match(index, /accept\.includes\('text\/html'\)/);
  assert.match(index, /\/service\.json/);
  assert.match(index, /\/public-stats\.json/);
  assert.match(publicSource, /Don't revalidate what another agent just saw/);
  assert.match(publicSource, /Qualified reuse/);
  assert.match(publicSource, /observations, not universal truth|Observations, not universal truth/i);
  assert.doesNotMatch(publicSource, /guaranteed savings|verified truth|independent agents confirmed/i);
  assert.match(stats, /qualified_reuse_rate/);
  assert.doesNotMatch(stats, /cross_client_reuse_rate/);
  assert.doesNotMatch(stats, /client_key|observer_key|lease_id|source_url|value_json|public_key/i);
});

test('A2A is tracked but not falsely exposed as a v1 protocol surface', () => {
  const index = read('src','index.ts');
  const standards = read('src','standards.ts');
  const publicSource = read('src','public.ts');
  assert.doesNotMatch(index, /agent-card|\.well-known\/agent|\/a2a/i);
  assert.doesNotMatch(index, /\/signup|\/oauth|\/account/i);
  assert.match(standards, /monitored_not_exposed/);
  assert.match(publicSource, /standardsPosture\.a2a\.status/);
  assert.match(publicSource, /standardsPosture\.a2a\.tracked/);
});

test('maintenance autopilot can prepare updates but cannot silently write production code', () => {
  const dependabot = read('.github','dependabot.yml');
  const workflow = read('.github','workflows','standards-watch.yml');
  const watch = read('scripts','standards-watch.mjs');
  const docs = read('docs','MAINTENANCE_AUTOPILOT.md');
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.match(workflow, /issues: write/);
  assert.doesNotMatch(workflow, /git push|merge|deploy|vercel --prod/);
  assert.match(watch, /Discovery never mutates production/);
  assert.match(docs, /explicit release/i);
  assert.match(docs, /No maintenance automation may/);
});

test('standards posture pins implemented MCP and treats other standards explicitly', () => {
  const standards = read('src','standards.ts');
  assert.match(standards, /implemented: '2026-07-28'/);
  assert.match(standards, /@modelcontextprotocol\/server@2\.0\.0/);
  assert.match(standards, /tracked: '1\.0\.0'/);
  assert.match(standards, /RFC9700/);
  assert.match(standards, /RFC9449/);
});

test('online project surfaces satisfy the private-context boundary', () => {
  const files = [
    'README.md',
    ...fs.readdirSync(path.join(root,'docs')).filter(f=>f.endsWith('.md')).map(f=>`docs/${f}`),
    ...fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.ts')).map(f=>`src/${f}`),
    ...fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.js')).map(f=>`public/${f}`)
  ];
  const blocked = new Set([
    'd636fa71c59b221586065ed418642575ba0f9ba3c879b62a9882d1780708da6e','06028c9760f4dfd106aa75df58d8443d02e23c05b3b22dcb74a9c146c732b427',
    '0b22f40bb71c86c993f01befd99951a36ff47f18b71b7a3b360fd1e817f5436b','59458508a0827cff5f80ed091ebd8808fbe67c97357b58ca00a278e7359dec20',
    '6dbd0f28d0d97656768b7b4ed96255e67fd11740a44b1c4b575191b06e9e3a35','a4279eae47aaa7417da62434795a011ccb0ec870f7f56646d181b5500a892a9a',
    '59b817983b45e008fc59f901c8f87153e7c1fc80a34ec5cad78bd0bdab1edbeb','3d724bf76ff8025e21ba21887add30b1aef20bad6d6c73c5e7bb38d7bdbbc846',
    'a7484abe7e90d8b9ea775b8ead29704b1d0cffa4ec4e8513d5020ee79b51b182','31de312977fc2ebdfead5003842e1a6cea1f1ea29b8de13ff4e9e3e90b2b47a1',
    '371f7e4223809d8bce3d52f6a5358e47c4b57aa00cbe0a4d8b47d74f010dffa6','d23be8d1141403ea5dd4df238b3b374b09c14e6671fb22a6c2e40c72cef92e26',
    '9fe5f2d718f0590f20fec562f1e0ee34ce053d1757da438fe55566ee8901bd08','c6f915ee1b5055c723868a2cf61842dd75abcbca9da29f4f74c7ac969f326dba'
  ]);
  const digest=s=>createHash('sha256').update(s).digest('hex');
  for (const file of files) {
    const words=(read(...file.split('/')).toLowerCase().match(/[a-z]+/g)||[]);
    const candidates=[...words];
    for(let i=0;i<words.length-1;i++) candidates.push(`${words[i]} ${words[i+1]}`);
    for (const candidate of candidates) assert.equal(blocked.has(digest(candidate)),false,`${file} violates the private-context boundary`);
  }
  assert.equal(fs.existsSync(path.join(root,'docs','OPERATIONS_TRANSFER.md')), true);
});
