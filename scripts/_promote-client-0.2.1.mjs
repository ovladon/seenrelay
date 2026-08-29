import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function replace(path, from, to) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(from)) throw new Error(`${path}: expected source text missing`);
  fs.writeFileSync(path, current.replace(from, to));
}

function replaceAll(path, from, to) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(from)) throw new Error(`${path}: expected ${from} missing`);
  fs.writeFileSync(path, current.split(from).join(to));
}

replace(
  'scripts/sync-public-surfaces.mjs',
  'JavaScript/TypeScript 0.2.0 supports provider-independent local-first Zero-State; Python remains shadow-first in this release.',
  'JavaScript/TypeScript ${facts.install.client_version} supports provider-independent local-first Zero-State; Python remains shadow-first in this release.'
);

for (const path of [
  'README.md',
  'clients/README.md',
  'docs/CLIENTS.md',
  'docs/QUICKSTART.md',
  'src/adoption.ts',
  'src/public.ts',
  'src/quickstart.ts'
]) {
  replaceAll(path, '0.2.0', '0.2.1');
}

replace(
  '.github/workflows/package-registry-readiness.yml',
  `          if (process.env.CLIENT_VERSION === process.env.RELEASE_VERSION && process.env.RELEASE_VERSION === '0.2.0') {\n            const zeroState = await import('seenrelay/zero-state');\n            const auto = await import('seenrelay/auto');\n            const mcpAuto = await import('seenrelay/mcp-auto');\n            if (\n              typeof zeroState.SeenRelayZeroState !== 'function' ||\n              typeof auto.SeenRelayAuto !== 'function' ||\n              typeof mcpAuto.protectMcpClient !== 'function'\n            ) {\n              throw new Error('public npm 0.2.0 subpath smoke failed');\n            }\n          }`,
  `          const [major, minor] = process.env.RELEASE_VERSION.split('.').map(Number);\n          const releaseHasZeroState = major > 0 || minor >= 2;\n          if (process.env.CLIENT_VERSION === process.env.RELEASE_VERSION && releaseHasZeroState) {\n            const zeroState = await import('seenrelay/zero-state');\n            const auto = await import('seenrelay/auto');\n            const mcpAuto = await import('seenrelay/mcp-auto');\n            if (\n              typeof zeroState.SeenRelayZeroState !== 'function' ||\n              typeof auto.SeenRelayAuto !== 'function' ||\n              typeof mcpAuto.protectMcpClient !== 'function'\n            ) {\n              throw new Error(\`public npm \${process.env.RELEASE_VERSION} subpath smoke failed\`);\n            }\n          }`
);

const sync = spawnSync(process.execPath, ['scripts/sync-public-surfaces.mjs', '--write'], {
  stdio: 'inherit'
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

const check = spawnSync(process.execPath, ['scripts/sync-public-surfaces.mjs'], {
  stdio: 'inherit'
});
if (check.status !== 0) process.exit(check.status ?? 1);
