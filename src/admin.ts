import { config } from './config.js';
import { PayloadTooLargeError, readJsonBody } from './http.js';
import { getAdminAdoptionData, getAdminSnapshotData, getRuntimeControls, recordAdminAudit, setRuntimeControls, type RuntimeMode } from './admin-db.js';
import { invalidateRuntimeControlCache } from './controls.js';
import { runHiveHousekeeping } from './reuse.js';
import { getPublicStats } from './public-db.js';
import { standardsPosture } from './standards.js';
import { custodyTransferReadiness, operationalReadiness } from './strategic.js';
import { hiveSigningRotationState } from './hive.js';

const COOKIE = 'sr_admin';

type AdminSecrets = { current: string | null; previous: string | null };
function adminSecrets(): AdminSecrets {
  const current = process.env.ADMIN_SECRET?.trim() || null;
  const previous = process.env.ADMIN_SECRET_PREVIOUS?.trim() || null;
  if (current && current.length < 32) throw new Error('ADMIN_SECRET must contain at least 32 characters when configured');
  if (previous && previous.length < 32) throw new Error('ADMIN_SECRET_PREVIOUS must contain at least 32 characters when configured');
  if (previous && !current) throw new Error('ADMIN_SECRET_PREVIOUS cannot be configured without ADMIN_SECRET');
  if (previous && previous === current) throw new Error('ADMIN_SECRET_PREVIOUS must differ from ADMIN_SECRET');
  return { current, previous };
}
function secret(): string | null { return adminSecrets().current; }
export function adminSecretRotationState(): { configured: boolean; previousAuthenticationKeyActive: boolean } {
  const { current, previous } = adminSecrets();
  return { configured: Boolean(current), previousAuthenticationKeyActive: Boolean(previous) };
}
function bytes(value: string): Uint8Array<ArrayBuffer> { return new TextEncoder().encode(value); }
function b64(input: Uint8Array): string {
  let s=''; for (const b of input) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function unb64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { const p=value.replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(p+'='.repeat((4-p.length%4)%4)); return Uint8Array.from(raw,c=>c.charCodeAt(0)); } catch { return null; }
}
async function key(material: string): Promise<CryptoKey> { return crypto.subtle.importKey('raw',bytes(material),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
async function currentKey(): Promise<CryptoKey> {
  const current=secret(); if (!current) throw new Error('ADMIN_SECRET is not configured with at least 32 characters');
  return key(current);
}
async function sign(value: string): Promise<string> { return b64(new Uint8Array(await crypto.subtle.sign('HMAC',await currentKey(),bytes(value)))); }
async function makeSession(): Promise<string> {
  const now=Math.floor(Date.now()/1000); const payload={v:1,iat:now,exp:now+config().adminSessionTtlSeconds,nonce:crypto.randomUUID()};
  const encoded=b64(bytes(JSON.stringify(payload))); return `${encoded}.${await sign(encoded)}`;
}
function cookieValue(request: Request): string | null {
  for (const part of (request.headers.get('cookie')||'').split(';')) { const [k,...rest]=part.trim().split('='); if (k===COOKIE) return rest.join('='); }
  return null;
}
async function verifySessionSignature(payload: string, signature: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const { current, previous }=adminSecrets(); if (!current) return false;
  if (await crypto.subtle.verify('HMAC',await key(current),signature,bytes(payload))) return true;
  return Boolean(previous && await crypto.subtle.verify('HMAC',await key(previous),signature,bytes(payload)));
}
async function verifySession(request: Request): Promise<{token:string;csrf:string}|null> {
  if (!secret()) return null;
  const token=cookieValue(request); if (!token || token.length>4096) return null;
  const [payload,sig,...extra]=token.split('.'); if (!payload||!sig||extra.length) return null;
  const signature=unb64(sig), raw=unb64(payload); if (!signature||!raw) return null;
  if (!await verifySessionSignature(payload,signature)) return null;
  try {
    const p=JSON.parse(new TextDecoder().decode(raw)); const now=Math.floor(Date.now()/1000);
    if (p?.v!==1 || !Number.isFinite(p?.iat) || !Number.isFinite(p?.exp) || p.exp<=now || p.iat>now+300 || typeof p?.nonce!=='string') return null;
    return {token,csrf:await sign(`csrf|${token}`)};
  } catch { return null; }
}
async function sameSecret(a: string,b: string): Promise<boolean> {
  const [ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',bytes(a)),crypto.subtle.digest('SHA-256',bytes(b))]);
  const aa=new Uint8Array(ha),bb=new Uint8Array(hb); let diff=aa.length^bb.length;
  for(let i=0;i<Math.min(aa.length,bb.length);i++) diff|=aa[i]!^bb[i]!;
  return diff===0;
}
async function matchesConfiguredAdminSecret(supplied: string): Promise<'current'|'previous'|null> {
  const { current, previous }=adminSecrets(); if (!current) return null;
  if (await sameSecret(supplied,current)) return 'current';
  if (previous && await sameSecret(supplied,previous)) return 'previous';
  return null;
}
export async function verifyAdminSecretForTest(supplied: string): Promise<'current'|'previous'|null> { return matchesConfiguredAdminSecret(supplied); }

function headers(extra: Record<string,string>={}): Headers {
  return new Headers({'cache-control':'no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",...extra});
}
function json(body: unknown,status=200,extra:Record<string,string>={}): Response { return new Response(JSON.stringify(body),{status,headers:headers({'content-type':'application/json; charset=utf-8',...extra})}); }
function html(body:string,status=200):Response { return new Response(body,{status,headers:headers({'content-type':'text/html; charset=utf-8'})}); }
function shell(authenticated:boolean):string { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SeenRelay Control Room</title><link rel="stylesheet" href="/admin.css"><link rel="stylesheet" href="/admin-v2.css"><link rel="stylesheet" href="/admin-discovery.css"></head><body data-auth="${authenticated?'1':'0'}"><main id="app">${authenticated?'<div class="boot">Loading SeenRelay Control Room…</div>':'<section class="login card"><h1>SeenRelay Control Room</h1><p>Human administration only. This surface is never exposed as an agent operation.</p><form id="login"><label>Admin secret<input id="secret" type="password" autocomplete="current-password" required></label><button>Unlock</button><p id="login-error" class="error"></p></form></section>'}</main><script src="/admin-discovery.js" defer></script><script src="/admin-v2.js" defer></script></body></html>`; }
async function requireAdmin(request: Request): Promise<{token:string;csrf:string}|Response> { return (await verifySession(request)) || json({error:{code:'ADMIN_UNAUTHORIZED'}},401); }
async function csrfOk(request:Request,auth:{csrf:string}):Promise<boolean> { return request.headers.get('x-seenrelay-csrf')===auth.csrf; }

export async function adminPage(request: Request): Promise<Response> { return html(shell(Boolean(await verifySession(request)))); }
export async function adminLogin(request: Request): Promise<Response> {
  if (!secret()) return json({error:{code:'ADMIN_NOT_CONFIGURED'}},503);
  let supplied='';
  try { supplied=String((await readJsonBody<{secret?:unknown}>(request, config().maxBodyBytes))?.secret||''); }
  catch (error) { return error instanceof PayloadTooLargeError ? json({error:{code:'PAYLOAD_TOO_LARGE'}},413) : json({error:{code:'INVALID_REQUEST'}},400); }
  const matched=await matchesConfiguredAdminSecret(supplied);
  if (!matched) { await new Promise(r=>setTimeout(r,250)); return json({error:{code:'ADMIN_UNAUTHORIZED'}},401); }
  const token=await makeSession(); await recordAdminAudit('ADMIN_LOGIN',{credential_generation:matched});
  return json({ok:true,credential_generation:matched},200,{'set-cookie':`${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${config().adminSessionTtlSeconds}`});
}
export async function adminLogout(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  if (!await csrfOk(request,auth)) return json({error:{code:'CSRF'}},403);
  await recordAdminAudit('ADMIN_LOGOUT',{});
  return json({ok:true},200,{'set-cookie':`${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
}

function readinessPayload() { return { standards:standardsPosture, operations:operationalReadiness(), custody_transfer:custodyTransferReadiness() }; }
function rotationPosture() {
  const admin=adminSecretRotationState(), hive=hiveSigningRotationState();
  return { admin_previous_key_active:admin.previousAuthenticationKeyActive, hive_previous_key_active:hive.previousVerificationKeyActive, transition_active:admin.previousAuthenticationKeyActive||hive.previousVerificationKeyActive };
}
function adoptionUnavailable(error: unknown) {
  console.error(JSON.stringify({event:'admin_adoption_snapshot_error',error:error instanceof Error?error.message:'unknown'}));
  return {
    status:'unavailable' as const,
    classification:'reference-observer-excluded',
    summary:{},
    active_external_leases:[],
    recent_external_reuse:[],
    top_external_contributors:[]
  };
}

export async function adminSnapshot(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  const [controls,data]=await Promise.all([getRuntimeControls(),getAdminSnapshotData()]);
  let adoption: Awaited<ReturnType<typeof getAdminAdoptionData>> | ReturnType<typeof adoptionUnavailable>;
  try { adoption=await getAdminAdoptionData(); } catch (error) { adoption=adoptionUnavailable(error); }
  const summary=data.summary as Record<string,unknown>;
  const adoptionSummary=adoption.summary as Record<string,unknown>;
  const checks=Number(adoptionSummary.checks_external_month ?? summary.checks_month ?? 0);
  const reuse=Number(adoptionSummary.reuse_external_month ?? summary.reuse_month ?? 0);
  const unknown=Number(summary.unknown_month||0);
  const adminRotation=adminSecretRotationState(), hiveRotation=hiveSigningRotationState();
  return json({
    now:new Date().toISOString(),csrf:auth.csrf,controls,data,adoption,
    derived:{qualified_reuse_rate:checks?reuse/checks:0,unknown_rate:checks?unknown/checks:0},
    safety:{billing_enabled:false,admin_secret_configured:adminRotation.configured,admin_previous_secret_active:adminRotation.previousAuthenticationKeyActive,hive_signing_secret_dedicated:hiveRotation.dedicated,hive_previous_signing_secret_active:hiveRotation.previousVerificationKeyActive,privacy_salt_configured:Boolean(process.env.PRIVACY_SALT?.trim()),declared_vercel_hard_spend_cap_usd:config().declaredVercelHardSpendCapUsd,provider_spend_cap_verified_by_app:false},
    semantics:{fact_identity:'seenrelay-fact-v3',operations:['CHECK','OBSERVE'],truth_oracle:false,reward:'qualified cross-bucket reuse only; never truth confidence',adoption:'external activity excludes the bounded first-party Reference Observer'},
    readiness:readinessPayload(),credential_rotation:rotationPosture()
  });
}

export async function adminOperationsExport(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  const [controls,stats]=await Promise.all([getRuntimeControls(),getPublicStats()]);
  let adoption: unknown;
  try { adoption=await getAdminAdoptionData(); } catch { adoption={status:'unavailable'}; }
  await recordAdminAudit('OPERATIONS_EXPORT',{});
  const adminRotation=adminSecretRotationState(), hiveRotation=hiveSigningRotationState();
  return json({
    generated_at:new Date().toISOString(),
    service:{name:'SeenRelay',version:config().version,domain:'seenrelay.com',operations:['CHECK','OBSERVE'],fact_identity:'seenrelay-fact-v3'},
    operational_summary:stats,
    external_adoption:adoption,
    runtime:{mode:controls.mode,checks_enabled:controls.checks_enabled,observes_enabled:controls.observes_enabled,rewards_enabled:controls.rewards_enabled},
    security_posture:{admin_secret_configured:adminRotation.configured,admin_previous_secret_active:adminRotation.previousAuthenticationKeyActive,hive_signing_secret_configured:hiveRotation.dedicated,hive_previous_signing_secret_active:hiveRotation.previousVerificationKeyActive,privacy_salt_configured:Boolean(process.env.PRIVACY_SALT?.trim()),billing_enabled:false},
    credential_rotation:rotationPosture(),...readinessPayload(),
    exclusions:['No secrets','No Hive lease tokens','No IP addresses','No raw public keys','No admin CSRF/session material']
  });
}

function validMode(v:unknown):v is RuntimeMode { return ['NORMAL','SHIELD','READ_ONLY','FREEZE'].includes(String(v)); }
interface ControlPatch { mode?:RuntimeMode; checks_enabled?:boolean; observes_enabled?:boolean; rewards_enabled?:boolean; capacity_multiplier?:number; refill_multiplier?:number; }
export async function adminControl(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  if (!await csrfOk(request,auth)) return json({error:{code:'CSRF'}},403);
  let body:Record<string,unknown>;
  try { body=await readJsonBody<Record<string,unknown>>(request, config().maxBodyBytes); }
  catch (error) { return error instanceof PayloadTooLargeError ? json({error:{code:'PAYLOAD_TOO_LARGE'}},413) : json({error:{code:'INVALID_REQUEST'}},400); }
  const patch:ControlPatch={};
  if (body.mode!==undefined) { if(!validMode(body.mode)) return json({error:{code:'INVALID_MODE'}},400); patch.mode=body.mode; }
  for (const k of ['checks_enabled','observes_enabled','rewards_enabled'] as const) if(body[k]!==undefined) { if(typeof body[k]!=='boolean') return json({error:{code:'INVALID_CONTROL'}},400); patch[k]=body[k]; }
  for (const k of ['capacity_multiplier','refill_multiplier'] as const) if(body[k]!==undefined) { const n=Number(body[k]); if(!Number.isFinite(n)||n<0||n>2) return json({error:{code:'INVALID_MULTIPLIER'}},400); patch[k]=n; }
  const next=await setRuntimeControls(patch,'admin'); invalidateRuntimeControlCache(); await recordAdminAudit('CONTROL_UPDATE',{patch,next}); return json({ok:true,controls:next});
}

const PLAYBOOKS:Record<string,{label:string;patch:ControlPatch;explanation:string}>={
  NORMAL:{label:'Normal operation',patch:{mode:'NORMAL',checks_enabled:true,observes_enabled:true,rewards_enabled:true,capacity_multiplier:1,refill_multiplier:1},explanation:'Restores normal CHECK, OBSERVE and delayed reuse rewards.'},
  TRAFFIC_SPIKE:{label:'Traffic / Sybil shield',patch:{mode:'SHIELD',checks_enabled:true,observes_enabled:true,rewards_enabled:false,capacity_multiplier:0.25,refill_multiplier:0.25},explanation:'Keeps service useful while quartering Hive allowance and suspending rewards.'},
  POISONING:{label:'Suspected poisoning',patch:{mode:'READ_ONLY',checks_enabled:true,observes_enabled:false,rewards_enabled:false,capacity_multiplier:0.5,refill_multiplier:0.5},explanation:'Stops new observations and rewards while preserving bounded CHECK access.'},
  COST_EMERGENCY:{label:'Cost emergency',patch:{mode:'FREEZE',checks_enabled:false,observes_enabled:false,rewards_enabled:false,capacity_multiplier:0,refill_multiplier:0},explanation:'Stops CHECK/OBSERVE at the application layer; provider spend controls remain the final circuit breaker.'},
  FREEZE:{label:'Emergency freeze',patch:{mode:'FREEZE',checks_enabled:false,observes_enabled:false,rewards_enabled:false,capacity_multiplier:0,refill_multiplier:0},explanation:'Stops all domain operations.'}
};
export async function adminPlaybook(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  if (!await csrfOk(request,auth)) return json({error:{code:'CSRF'}},403);
  let body:{playbook?:unknown};
  try { body=await readJsonBody<{playbook?:unknown}>(request, config().maxBodyBytes); }
  catch (error) { return error instanceof PayloadTooLargeError ? json({error:{code:'PAYLOAD_TOO_LARGE'}},413) : json({error:{code:'INVALID_REQUEST'}},400); }
  const selected=PLAYBOOKS[String(body?.playbook||'')]; if(!selected) return json({error:{code:'UNKNOWN_PLAYBOOK'}},400);
  const next=await setRuntimeControls(selected.patch,'playbook'); invalidateRuntimeControlCache();
  await recordAdminAudit('PLAYBOOK',{label:selected.label,explanation:selected.explanation});
  return json({ok:true,controls:next,playbook:{label:selected.label,explanation:selected.explanation}});
}

export async function adminHousekeeping(request: Request): Promise<Response> {
  const auth=await requireAdmin(request); if (auth instanceof Response) return auth;
  if (!await csrfOk(request,auth)) return json({error:{code:'CSRF'}},403);
  const cfg=config();
  const result=await runHiveHousekeeping(cfg.hiveLeaseRetentionSeconds,cfg.hiveReuseRetentionSeconds,cfg.retentionSeconds);
  await recordAdminAudit('HOUSEKEEPING',result);
  return json({ok:true,result});
}
