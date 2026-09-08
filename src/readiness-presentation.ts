import { readinessPage } from './readiness.js';

export type ReadinessPresentationDescriptor = {
  schema: 'seenrelay-readiness-presentation-v1';
  human: string;
  machine: string;
  openapi: string;
  defaultBrowserAudit: 'v1';
  audits: {
    v1: {
      endpoint: string;
      method: 'POST';
      enabled: true;
      responseSchema: 'seenrelay-ai-visit-efficiency-quick-audit-v1';
      requestCount: 1;
      maxBodyBytes: 131072;
    };
    v2: {
      endpoint: string;
      method: 'POST';
      enabled: boolean;
      availability: 'enabled' | 'activation-gated';
      responseProtocol: 'seenrelay-site-audit-execution-v2';
      requestCount: 6;
      retries: 0;
      totalMaxBytes: 786432;
    };
  };
  principles: {
    standardsNativeFirst: true;
    surfaceScanEstablishesSeenRelayFit: false;
    coreMcpOperations: readonly ['CHECK', 'OBSERVE'];
  };
};

export function readinessSurfaceDescriptor(origin: string, v2Enabled: boolean): ReadinessPresentationDescriptor {
  return {
    schema: 'seenrelay-readiness-presentation-v1',
    human: `${origin}/readiness`,
    machine: `${origin}/readiness.json`,
    openapi: `${origin}/openapi.json`,
    defaultBrowserAudit: 'v1',
    audits: {
      v1: {
        endpoint: `${origin}/readiness/audit`,
        method: 'POST',
        enabled: true,
        responseSchema: 'seenrelay-ai-visit-efficiency-quick-audit-v1',
        requestCount: 1,
        maxBodyBytes: 131072
      },
      v2: {
        endpoint: `${origin}/readiness/audit/v2`,
        method: 'POST',
        enabled: v2Enabled,
        availability: v2Enabled ? 'enabled' : 'activation-gated',
        responseProtocol: 'seenrelay-site-audit-execution-v2',
        requestCount: 6,
        retries: 0,
        totalMaxBytes: 786432
      }
    },
    principles: {
      standardsNativeFirst: true,
      surfaceScanEstablishesSeenRelayFit: false,
      coreMcpOperations: ['CHECK', 'OBSERVE']
    }
  };
}

export function readinessPresentationPage(origin: string, v2Enabled: boolean): string {
  const extendedChoice = v2Enabled
    ? '<label class="readiness-small" for="readiness-use-v2"><input id="readiness-use-v2" type="checkbox"> Use the extended v2 machine-surface audit instead (6 fixed same-origin GETs, 768 KiB aggregate cap, zero retries).</label>'
    : '';

  return readinessPage(origin)
    .replace(
      `<link rel="canonical" href="${origin}/readiness">`,
      `<link rel="canonical" href="${origin}/readiness">\n<link rel="alternate" type="application/json" href="${origin}/readiness.json" title="SeenRelay readiness machine descriptor">`
    )
    .replace(
      '<a class="rv-chip" href="/service.json">Machine JSON</a>',
      '<a class="rv-chip" href="/readiness.json">Readiness JSON</a>'
    )
    .replace(
      '<form id="readiness-form" class="readiness-form">',
      `<form id="readiness-form" class="readiness-form" data-quick-endpoint="/readiness/audit" data-v2-endpoint="/readiness/audit/v2" data-v2-enabled="${v2Enabled ? 'true' : 'false'}">${extendedChoice}`
    );
}
