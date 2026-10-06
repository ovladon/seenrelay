import { getAdminAdoptionData } from './admin-db.js';

function integer(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

/**
 * Privacy-safe aggregate technical-adoption snapshot.
 *
 * This endpoint deliberately exposes no lease IDs, client keys, network buckets,
 * fact keys, source URLs, observer keys, IP-derived material, or raw observations.
 * It is technical usage evidence only; it is not a unique-human/company, ROI,
 * willingness-to-pay, procurement, or revenue metric.
 */
export async function getPublicExternalAdoptionSnapshot() {
  const adoption = await getAdminAdoptionData();
  const summary = adoption.summary as Record<string, unknown>;

  return {
    schema: 'seenrelay-external-adoption-summary-v1',
    generated_at: new Date().toISOString(),
    classification: 'privacy-safe-aggregate-external-technical-adoption',
    filter: {
      first_party_excluded: true,
      controlled_benchmarks_excluded: true,
      public_demo_excluded: true,
      qualified_reuse_requires_external_contributor_and_consumer: true,
      qualified_reuse_excludes_internal_benchmark_fact: true
    },
    claim_boundary: {
      technical_activity_only: true,
      unique_humans_or_companies: false,
      customer_monetary_savings: false,
      net_roi: false,
      willingness_to_pay: false,
      procurement: false,
      recurring_revenue: false,
      market_liquidity: false,
      geography: false,
      client_only_local_first_usage_visible: false
    },
    external_technical: {
      retained_leases: integer(summary.leases_external),
      repeat_leases: integer(summary.leases_external_repeat),
      bidirectional_leases: integer(summary.leases_external_bidirectional),
      qualified_cross_client_reuse_events: integer(summary.reuse_external_qualified_cross_client_total),
      qualified_reuse_consumer_leases: integer(summary.reuse_external_qualified_consumer_leases),
      first_activity_at: optionalText(summary.first_external_activity_at),
      last_activity_at: optionalText(summary.last_external_activity_at)
    }
  };
}
