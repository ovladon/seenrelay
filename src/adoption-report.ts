import { z } from 'zod';
import { recordAdoptionReport, getAdoptionReportAggregate } from './db.js';

export const adoptionReportSchema = z.object({
  schema: z.literal('seenrelay-adoption-report-v1'),
  seenrelay_version: z.string().min(1).max(32).regex(/^[0-9A-Za-z.+_-]+$/),
  integration_class: z.enum(['cli','ambient','zero-state','fleet','classic','mcp','other']),
  deployment: z.enum(['local','hosted','private-l1']),
  mode: z.enum(['shadow','active']),
  verdict: z.enum(['USE','DO_NOT_USE','INSUFFICIENT_EVIDENCE']),
  workload_class: z.enum(['web-search','scraping','api-read','mcp-tool','llm-inference','compute','monitoring','other'])
}).strict();

export type AdoptionReport = z.infer<typeof adoptionReportSchema>;

export async function ingestAdoptionReport(body: unknown) {
  const parsed = adoptionReportSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400 as const,
      body: { error: { code: 'INVALID_ADOPTION_REPORT', detail: 'Payload must match the closed adoption-report schema.' } }
    };
  }
  await recordAdoptionReport(parsed.data, new Date().toISOString());
  return {
    ok: true as const,
    status: 202 as const,
    body: {
      accepted: true,
      schema: parsed.data.schema,
      stored_as: 'aggregate-only',
      identity_persisted: false
    }
  };
}

export async function adoptionReportSummary() {
  const rows = await getAdoptionReportAggregate();
  const total = rows.reduce((sum, row) => sum + Number(row.reports || 0), 0);
  const last = rows.reduce<string | null>((max, row) => !max || row.last_at > max ? row.last_at : max, null);
  return {
    schema: 'seenrelay-adoption-report-summary-v1',
    generated_at: new Date().toISOString(),
    classification: 'explicit-opt-in-self-reported-technical-usage',
    claim_boundary: {
      unique_humans_or_companies: false,
      verified_customer_adoption: false,
      customer_roi: false,
      willingness_to_pay: false,
      geography: false,
      identity_tracking: false
    },
    total_reports: total,
    last_report_at: last,
    breakdown: rows
  };
}
