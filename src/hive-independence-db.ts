import { neon } from '@neondatabase/serverless';

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

/**
 * Binds a lease to its first conservative independence bucket. The binding is intentionally
 * immutable for the lease lifetime: carrying a valid lease to another network must not let a
 * caller manufacture a new independent identity for useful-reuse rewards.
 */
export async function bindHiveIndependenceKey(leaseId: string, independenceKey: string): Promise<void> {
  await sql().query(
    `UPDATE hive_leases
       SET independence_key = $2
     WHERE lease_id = $1
       AND independence_key IS NULL`,
    [leaseId, independenceKey]
  );
}
