import { publicProductFacts } from './public-facts.generated.js';
import { companyFleetCaseStudy } from './company-fleet-case-study.js';

function escHtml(value: unknown): string {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}
function escXml(value: unknown): string {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&apos;');
}

export type SeenRelayPublicUpdate = {
  id: string;
  date: string;
  title: string;
  summary: string;
  kind: 'operating_proof' | 'trust_and_agent_adoption' | 'verified_release_or_evidence';
  url: string;
  machine_url?: string;
  claim_boundary?: string;
};

export function publicUpdates(origin: string): SeenRelayPublicUpdate[] {
  const caseStudy: SeenRelayPublicUpdate = {
    id: 'company-fleet-operating-receipt-2026-10-02',
    date: companyFleetCaseStudy.verified_at,
    title: '8-agent verified savings record: shared evidence, independent reasoning',
    summary: 'Eight department agents preserved eight independent role analyses while paid web-search actions fell from 13 to 4 and measured provider cost fell from $0.16499684 to $0.05560972 in the completed paired first-party run.',
    kind: 'operating_proof',
    url: `${origin}/case-studies/company-fleet`,
    machine_url: `${origin}/case-studies/company-fleet.json`,
    claim_boundary: 'First-party operating evidence with one explicitly synthetic external-client rehearsal tenant; not customer ROI or net customer savings. The savings record is measurement evidence, not an invoice or payment receipt; SeenRelay billing is OFF.'
  };
  const trustAgent: SeenRelayPublicUpdate = {
    id: 'safe-to-try-agent-adoption-2026-10-02',
    date: '2026-10-02',
    title: 'Safe-to-try trust posture and machine-first agent adoption',
    summary: 'SeenRelay now publishes a machine-readable adoption contract for autonomous agents plus explicit safe-to-try controls: local scan, shadow-first measurement, fail-open fallback, shared CHECK off by default in Zero-State, zero default completed-result TTL, no implicit mutation suppression, and an easy remove path.',
    kind: 'trust_and_agent_adoption',
    url: `${origin}/agents`,
    machine_url: `${origin}/agent-adoption.json`,
    claim_boundary: 'Verifiable technical controls; not a third-party security certification or vulnerability-free claim.'
  };
  const verified = (publicProductFacts.latest_verified_updates || []).map((x, i) => ({
    id: `verified-update-${x.date}-${i}-${String(x.title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
    date: x.date,
    title: x.title,
    summary: x.summary,
    kind: 'verified_release_or_evidence' as const,
    url: `${origin}/updates#${x.date}-${i}`
  }));
  return [caseStudy, trustAgent, ...verified].sort((a,b)=>
    b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
  );
}

export function updatesDescriptor(origin: string) {
  const updates=publicUpdates(origin);
  return {
    schema:'seenrelay-public-updates-v1',
    generated_from:'canonical_public_product_facts_and_verified_public_evidence',
    canonical_url:`${origin}/updates`,
    json_url:`${origin}/updates.json`,
    atom_url:`${origin}/updates.atom`,
    count:updates.length,
    updates
  };
}

export function updatesPage(origin: string): string {
  const updates=publicUpdates(origin);
  const rows=updates.map((x,i)=>`<article id="${escHtml(x.date)}-${i}" class="rv-card">
    <div class="rv-eyebrow">${escHtml(x.date)} · ${escHtml(x.kind.replaceAll('_',' '))}</div>
    <h3>${escHtml(x.title)}</h3>
    <p>${escHtml(x.summary)}</p>
    ${x.claim_boundary?`<p class="rv-small"><b>Boundary:</b> ${escHtml(x.claim_boundary)}</p>`:''}
    <p><a href="${escHtml(x.url)}">Open canonical evidence →</a>${x.machine_url?` · <a href="${escHtml(x.machine_url)}">Machine JSON</a>`:''}</p>
  </article>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Canonical verified SeenRelay product, proof and trust updates generated from public evidence.">
<link rel="canonical" href="${origin}/updates">
<link rel="alternate" type="application/atom+xml" href="${origin}/updates.atom" title="SeenRelay verified updates">
<link rel="alternate" type="application/json" href="${origin}/updates.json" title="SeenRelay verified updates JSON">
<title>SeenRelay Updates — Canonical verified changes</title><link rel="stylesheet" href="/revamp.css"><link rel="stylesheet" href="/site.css"></head>
<body class="revamp"><header class="rv-nav"><a class="rv-brand" href="/">SeenRelay</a><nav class="rv-nav-links"><a href="/proof">Proof</a><a href="/trust">Trust</a><a href="/agents">Agents</a><a href="/quickstart">Docs</a></nav></header>
<main id="main-content"><section class="rv-shell rv-page-hero"><div class="rv-eyebrow">OWNED VERIFIED UPDATE STREAM</div><h1>Changes agents and operators can verify.</h1>
<p>This feed is generated from SeenRelay's own canonical public facts and verified evidence. It is an owned distribution surface: no social scheduler, analytics plugin or third-party publishing service is required.</p>
<div class="rv-actions"><a class="rv-button primary" href="/updates.atom">Atom feed</a><a class="rv-button" href="/updates.json">Machine JSON</a></div></section>
<section class="rv-shell rv-section"><div class="rv-stack">${rows}</div></section></main></body></html>`;
}

export function updatesAtom(origin: string): string {
  const updates=publicUpdates(origin);
  const updated=(updates[0]?.date||'2026-10-02')+'T00:00:00Z';
  const entries=updates.slice(0,50).map(x=>`<entry>
    <id>${escXml(origin+'/updates#'+x.id)}</id>
    <title>${escXml(x.title)}</title>
    <updated>${escXml(x.date+'T00:00:00Z')}</updated>
    <link href="${escXml(x.url)}"/>
    <summary>${escXml(x.summary+(x.claim_boundary?' Boundary: '+x.claim_boundary:''))}</summary>
  </entry>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escXml(origin+'/updates')}</id>
  <title>SeenRelay verified updates</title>
  <updated>${escXml(updated)}</updated>
  <link href="${escXml(origin+'/updates')}" rel="alternate"/>
  <link href="${escXml(origin+'/updates.atom')}" rel="self" type="application/atom+xml"/>
  ${entries}
</feed>`;
}
