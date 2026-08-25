import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(path,'utf8');
test('discovery funnel persists aggregate protocol-interest counters only',()=>{const migration=read('migrations/0005_mcp_discovery_metrics.sql');const source=read('src/discovery.ts');assert.match(migration,/mcp_discovery_metrics_daily/);assert.match(source,/method === 'initialize'/);assert.match(source,/method === 'tools\/list'/);assert.match(source,/aggregate-protocol-interest-not-adoption/);assert.doesNotMatch(migration.split('COMMENT ON TABLE')[0],/client_info|user_agent|ip_address|session_id|payload/i)});
test('MCP discovery telemetry is fail-open and separate from adoption',()=>{const mcp=read('src/mcp.ts');const admin=read('src/admin-db.ts');const ui=read('public/admin-discovery.js');assert.match(mcp,/mcp_discovery_metric_error/);assert.match(admin,/admin_discovery_snapshot_error/);assert.match(ui,/not unique agents and not adoption/i);assert.match(ui,/Reference Observer is never counted as external adoption/)});
test('Control Room loads discovery observer before the main admin script',()=>{const admin=read('src/admin.ts');const discovery=admin.indexOf('/admin-discovery.js');const main=admin.indexOf('/admin-v2.js');assert.ok(discovery>=0&&main>discovery);assert.match(admin,/admin-discovery\.css/)})
