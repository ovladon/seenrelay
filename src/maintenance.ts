import { config } from './config.js';
import { getAdminAdoptionData, getAdminSnapshotData, getRuntimeControls, recordAdminAudit } from './admin-db.js';
import { hiveSigningRotationState } from './hive.js';
import { internalTelemetryClassifierState } from './traffic-classification.js';
import { runHiveHousekeeping } from './reuse.js';
import { evaluateMaintenanceAutopilot } from './maintenance-autopilot.js';

function headers(extra: Record<string,string>={}) {
  return new Headers({'cache-control':'no-store','x-content-type-options':'nosniff',...extra});
}
function json(body: unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers:headers({'content-type':'application/json; charset=utf-8'})});
}
async function sameSecret(a:string,b:string):Promise<boolean> {
  const bytes=(v:string)=>new TextEncoder().encode(v);
  const [ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',bytes(a)),crypto.subtle.digest('SHA-256',bytes(b))]);
  const aa=new Uint8Array(ha),bb=new Uint8Array(hb); let diff=aa.length^bb.length;
  for(let i=0;i<Math.min(aa.length,bb.length);i++) diff|=aa[i]!^bb[i]!;
  return diff===0;
}

export function maintenanceSafetySnapshot() {
  const adminCurrent=process.env.ADMIN_SECRET?.trim() || '';
  const hiveRotation=hiveSigningRotationState();
  const internalTelemetry=internalTelemetryClassifierState();
  return {
    billing_enabled:config().paymentsEnabled,
    admin_secret_configured:adminCurrent.length >= 32,
    privacy_salt_configured:Boolean(process.env.PRIVACY_SALT?.trim()),
    hive_signing_secret_dedicated:hiveRotation.dedicated,
    internal_telemetry_classifier_configured:internalTelemetry.configured,
    maintenance_cron_configured:Boolean((process.env.CRON_SECRET?.trim() || '').length >= 32),
    provider_spend_cap_verified_by_app:false
  };
}

export function maintenanceRotationSnapshot() {
  const adminPrevious=process.env.ADMIN_SECRET_PREVIOUS?.trim() || '';
  const hive=hiveSigningRotationState();
  return { transition_active:adminPrevious.length >= 32||hive.previousVerificationKeyActive };
}

export async function collectMaintenanceAutopilot() {
  const [controls,data]=await Promise.all([getRuntimeControls(),getAdminSnapshotData()]);
  let adoption:any;
  try { adoption=await getAdminAdoptionData(); }
  catch { adoption={status:'unavailable',summary:{}}; }
  return evaluateMaintenanceAutopilot({
    controls,
    operational_summary:(data.summary as Record<string,unknown>) || {},
    adoption,
    safety:maintenanceSafetySnapshot(),
    credential_rotation:maintenanceRotationSnapshot()
  });
}

export async function runMaintenanceAutopilotCycle() {
  const cfg=config();
  const housekeeping=await runHiveHousekeeping(cfg.hiveLeaseRetentionSeconds,cfg.hiveReuseRetentionSeconds,cfg.retentionSeconds);
  const evaluation=await collectMaintenanceAutopilot();
  const result={
    version:'maintenance-cycle-v1',
    ran_at:new Date().toISOString(),
    automatic_actions:[{id:'retention-housekeeping',result:housekeeping}],
    evaluation
  };
  await recordAdminAudit('MAINTENANCE_AUTOPILOT',result);
  return result;
}

export async function maintenanceCron(request:Request):Promise<Response> {
  const secret=process.env.CRON_SECRET?.trim() || '';
  if (secret.length < 32) return json({error:{code:'MAINTENANCE_CRON_NOT_CONFIGURED'}},503);
  const auth=request.headers.get('authorization') || '';
  if (!await sameSecret(auth,`Bearer ${secret}`)) return json({error:{code:'MAINTENANCE_CRON_UNAUTHORIZED'}},401);
  try { return json({ok:true,result:await runMaintenanceAutopilotCycle()}); }
  catch (error) {
    console.error(JSON.stringify({event:'maintenance_autopilot_error',error:error instanceof Error?error.message:'unknown'}));
    return json({error:{code:'MAINTENANCE_AUTOPILOT_FAILED'}},500);
  }
}
