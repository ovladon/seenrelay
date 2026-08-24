import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hiveSigningRotationState, verifyHiveLeaseTokenForTest } from '../src/hive.js';
import { adminSecretRotationState, verifyAdminSecretForTest } from '../src/admin.js';

function leaseToken(secret: string, leaseId = 'rotation-test-lease'): string {
  const now = Date.now();
  const payload = {
    v: 1,
    lease_id: leaseId,
    issued_at: new Date(now - 1_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString()
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function saveEnv(names: string[]) {
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  };
}

test('credential rotation is make-before-break and fails closed on invalid configuration', async () => {
  const restore = saveEnv(['HIVE_SIGNING_SECRET','HIVE_SIGNING_SECRET_PREVIOUS','ADMIN_SECRET','ADMIN_SECRET_PREVIOUS']);
  const hiveCurrent = 'hive-current-'.padEnd(64, 'c');
  const hivePrevious = 'hive-previous-'.padEnd(64, 'p');
  const adminCurrent = 'admin-current-'.padEnd(64, 'c');
  const adminPrevious = 'admin-previous-'.padEnd(64, 'p');
  try {
    process.env.HIVE_SIGNING_SECRET = hiveCurrent;
    process.env.HIVE_SIGNING_SECRET_PREVIOUS = hivePrevious;
    process.env.ADMIN_SECRET = adminCurrent;
    process.env.ADMIN_SECRET_PREVIOUS = adminPrevious;

    assert.deepEqual(hiveSigningRotationState(), { dedicated: true, previousVerificationKeyActive: true });
    assert.deepEqual(adminSecretRotationState(), { configured: true, previousAuthenticationKeyActive: true });

    const currentLease = await verifyHiveLeaseTokenForTest(leaseToken(hiveCurrent, 'current-lease'));
    const previousLease = await verifyHiveLeaseTokenForTest(leaseToken(hivePrevious, 'previous-lease'));
    const foreignLease = await verifyHiveLeaseTokenForTest(leaseToken('foreign-secret-'.padEnd(64, 'x'), 'foreign-lease'));
    assert.deepEqual(currentLease, { leaseId: 'current-lease', key: 'current' });
    assert.deepEqual(previousLease, { leaseId: 'previous-lease', key: 'previous' });
    assert.equal(foreignLease, null);

    assert.equal(await verifyAdminSecretForTest(adminCurrent), 'current');
    assert.equal(await verifyAdminSecretForTest(adminPrevious), 'previous');
    assert.equal(await verifyAdminSecretForTest('wrong-secret'), null);

    // Removing previous secrets ends the grace window without changing the current identities.
    delete process.env.HIVE_SIGNING_SECRET_PREVIOUS;
    delete process.env.ADMIN_SECRET_PREVIOUS;
    assert.equal(await verifyHiveLeaseTokenForTest(leaseToken(hivePrevious, 'expired-grace')), null);
    assert.equal(await verifyAdminSecretForTest(adminPrevious), null);
    assert.deepEqual(hiveSigningRotationState(), { dedicated: true, previousVerificationKeyActive: false });
    assert.deepEqual(adminSecretRotationState(), { configured: true, previousAuthenticationKeyActive: false });

    // Unsafe transition configurations are rejected rather than silently accepted.
    process.env.HIVE_SIGNING_SECRET_PREVIOUS = hiveCurrent;
    assert.throws(() => hiveSigningRotationState(), /must differ/);
    delete process.env.HIVE_SIGNING_SECRET;
    assert.throws(() => hiveSigningRotationState(), /cannot be configured without/);

    process.env.ADMIN_SECRET = adminCurrent;
    process.env.ADMIN_SECRET_PREVIOUS = adminCurrent;
    assert.throws(() => adminSecretRotationState(), /must differ/);
    delete process.env.ADMIN_SECRET;
    assert.throws(() => adminSecretRotationState(), /cannot be configured without/);
  } finally {
    restore();
  }
});
