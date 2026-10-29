import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const script=fs.readFileSync(path.join(root,'public/admin-owner-overview.js'),'utf8');
const scope={Intl,Date,Number,Math,globalThis:{}};
vm.runInNewContext(script,scope,{filename:'admin-owner-overview.js',timeout:1000});
const model=scope.globalThis.SeenRelayOwnerOverview.model;
const base={
  now:'2026-10-29T10:00:00Z',
  adoption:{status:'ok',summary:{
    leases_external:3,active_external_5m:0,
    checks_external_retained:9,observations_external:4,
    reuse_external_qualified_cross_client_total:1,last_external_activity_at:'2026-10-29T09:00:00Z'
  }},
  adoption_atlas:{status:'ok',summary:{reports_total:2}},
  readiness:{operations:{gates:{payments_disabled:true}}},
  controls:{mode:'NORMAL'}
};
test('owner summary counts are telemetry, not people or commercial claims',()=>{
 const s=model(base,Date.parse(base.now));
 assert.equal(s.cards[0].value,'3');
 assert.match(s.cards[0].detail,/CHECK 9/);
 assert.match(s.cards[0].detail,/not customers/);
 assert.equal(s.cards[1].value,'1');
 assert.equal(s.cards[2].value,'NOT MEASURED');
 assert.equal(s.cards[3].value,'UNKNOWN');
 assert.match(s.cards[3].detail,/OFF/);
 assert.match(s.headline_detail,/1 hours ago/);
});
test('unavailable external classification must show UNKNOWN rather than zero',()=>{
 const s=model({...base,adoption:{status:'unavailable',summary:{}}});
 assert.equal(s.cards[0].value,'UNKNOWN');
 assert.equal(s.cards[1].value,'UNKNOWN');
 assert.match(s.headline,/unavailable/i);
 assert.match(s.signals.at(-1).detail,/restore/);
});
test('empty retained history is not interpreted as zero local installs',()=>{
 const a={...base.adoption,summary:{...base.adoption.summary,leases_external:0,reuse_external_qualified_cross_client_total:0}};
 const s=model({...base,adoption:a});
 assert.match(s.headline,/No retained/);
 assert.match(s.signals.at(-1).detail,/local-only users are invisible/i);
 assert.equal(s.cards[3].value,'UNKNOWN');
});
test('positive technical reuse never becomes verified financial savings',()=>{
 const s=model(base);
 assert.match(s.signals.at(-1).detail,/customer-approved cost data/);
 assert.equal(s.cards[2].value,'NOT MEASURED');
 assert.equal(s.cards[3].value,'UNKNOWN');
});
test('declared billing on, off, unknown are accurately differentiated',()=>{
 for(const [flag,word] of [[true,'OFF'],[false,'ON — REVIEW NOW'],[undefined,'UNKNOWN']]){
  const s=model({...base,readiness:{operations:{gates:{payments_disabled:flag}}}});
  assert.match(s.cards[3].detail,new RegExp(word));
 }
});
test('missing fields do not silently become zero, bad timestamps do not crash',()=>{
 const s=model({...base,now:'bad',adoption:{status:'ok',summary:{last_external_activity_at:'wrong'}}});
 assert.equal(s.cards[0].value,'UNKNOWN');
 assert.equal(s.cards[1].value,'UNKNOWN');
 assert.match(s.headline_detail,/not recorded/);
});
test('one shot initialization is read-only and does not call a remote endpoint',()=>{
 assert.doesNotMatch(script,/\bfetch\s*\(/);
 assert.doesNotMatch(script,/\binnerHTML\s*=/);
 assert.doesNotMatch(script,/\blocalStorage\b/);
 assert.doesNotMatch(script,/admin\/api\/control/);
});
test('authenticated page loads overview before the technical dashboard render',()=>{
 const index=fs.readFileSync(path.join(root,'src/admin.ts'),'utf8');
 const dashboard=fs.readFileSync(path.join(root,'public/admin-v2.js'),'utf8');
 assert.match(index,/admin-owner-overview.js/);
 assert.match(index,/admin-owner-overview.css/);
 assert.match(dashboard,/SeenRelayOwnerOverview\?\.render\(s\)/);
 assert.ok(index.indexOf('/admin-owner-overview.js')<index.indexOf('/admin-v2.js'));
});
test('admin reports actual payment configuration rather than a hard-coded false',()=>{
 const index=fs.readFileSync(path.join(root,'src/admin.ts'),'utf8');
 assert.match(index,/safety=\{billing_enabled:config\(\)\.paymentsEnabled/);
 assert.doesNotMatch(index,/safety=\{billing_enabled:false/);
});
