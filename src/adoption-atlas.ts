import { z } from 'zod';
import { ValidationError } from './canonical.js';
import { recordAdoptionAtlasReport, type AdoptionAtlasDimensions } from './adoption-atlas-db.js';

const reportSchema = z.object({
  schema_version: z.literal('seenrelay-adoption-report-v1'),
  seenrelay_version: z.string().regex(/^[0-9]+\\.[0-9]+\\.[0-9]+(?:[+-][0-9A-Za-z.-]+)?$/),
  integration_class: z.enum(['cli','sdk','mcp','agent-skill','framework-adapter','rest-openapi','other']),
  deployment_class: z.enum(['local','hosted','private-l1']),
  mode: z.enum(['shadow','active']),
  decision: z.enum(['USE','DO_NOT_USE','INSUFFICIENT']),
  workload_class: z.enum(['web-research','browser-automation','extraction','api-validation','mcp-tools','agent-tools','monitoring','other'])
}).strict();

export type AdoptionReport = z.infer<typeof reportSchema>;

export async function acceptAdoptionReport(input: unknown) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('invalid adoption-report payload');
  await recordAdoptionAtlasReport(parsed.data as AdoptionAtlasDimensions);
  return {
    accepted: true,
    classification: 'voluntary-unverified-aggregate-adoption-signal',
    privacy: {
      event_row_stored: false,
      identity_stored: false,
      ip_as_identity_stored: false,
      user_agent_stored: false,
      prompt_or_response_stored: false,
      source_or_fact_value_stored: false,
      repository_or_filename_stored: false
    },
    claim_boundary: {
      unique_user_or_company: false,
      verified_customer: false,
      adoption_truth: false,
      triangulation_signal_only: true
    }
  };
}
