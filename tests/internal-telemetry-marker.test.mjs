import test from 'node:test';
import assert from 'node:assert/strict';
import { internalTelemetryMarker } from '../scripts/internal-telemetry-marker.mjs';

test('internal telemetry marker has a stable HMAC vector and rejects ambiguous paths', () => {
  const secret='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const marker=internalTelemetryMarker({
    secret,
    method:'POST',
    path:'/v1/check',
    clientHint:'operator-probe',
    now:new Date(1788080400000)
  });
  assert.equal(marker,'v1.1788080400.5Sd_eSTFRVwUAJXLENmdOaEa0zoXsNTF5D2SyNjtR1o');
  assert.throws(()=>internalTelemetryMarker({secret,method:'POST',path:'/v1/check?x=1'}),/pathname without query or fragment/);
  assert.throws(()=>internalTelemetryMarker({secret:'short',method:'POST',path:'/v1/check'}),/at least 32 characters/);
});
