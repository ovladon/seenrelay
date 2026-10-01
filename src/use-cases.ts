export const publicUseCaseAtlas = {
  schema: 'seenrelay-public-use-case-atlas-v1',
  updated_at: '2026-10-01',
  claim_boundary: 'A listed domain is not a deployment or customer-ROI claim. Status distinguishes measured vertical evidence from mechanism applicability and research.',
  statuses: {
    VALIDATED_VERTICAL: 'Controlled domain-specific evidence exists.',
    PROVEN_MECHANISM_APPLICABLE: 'A SeenRelay economic primitive is proven, but this vertical has not been directly validated.',
    EXPERIMENTAL: 'Structurally promising and benchmark-worthy; no promoted vertical claim yet.',
    RESEARCH: 'Potentially useful, but domain/safety evidence is required before product promotion.'
  },
  cases: [
    {
      id:'retail-prices',
      name:'Retail prices & product monitoring',
      status:'VALIDATED_VERTICAL',
      value:'Avoid repeated paid extraction while the relevant commercial state is unchanged; force new work when the state fingerprint changes.',
      native_first:'Direct product/state signal, provider cache and source validators when sufficient.',
      integration:'HTTP/extraction wrapper or monitor middleware',
      proof:'/proof'
    },
    {
      id:'weather-analysis',
      name:'Weather-driven downstream analysis',
      status:'VALIDATED_VERTICAL',
      value:'Use cheap/native weather state to avoid repeating paid downstream analysis until relevant state changes.',
      native_first:'Weather provider update cadence, cache and push/event mechanisms.',
      integration:'State fingerprint + downstream analysis guard',
      proof:'/proof'
    },
    {
      id:'agentic-search',
      name:'AI agent search & research',
      status:'PROVEN_MECHANISM_APPLICABLE',
      value:'Coordinate compatible top-level paid search/tool executions across agents.',
      native_first:'Provider caching, framework single-flight and explicit shared-artifact semantics.',
      integration:'Agent/tool middleware, MCP or SDK wrapper',
      proof:'/proof'
    },
    {
      id:'hosted-compute',
      name:'Hosted compute, sandboxes & code tools',
      status:'PROVEN_MECHANISM_APPLICABLE',
      value:'Avoid allocating multiple billed sessions when compatible callers require one deterministic execution.',
      native_first:'Provider session reuse and local process coordination.',
      integration:'Tool/runtime wrapper',
      proof:'/proof'
    },
    {
      id:'web-extraction',
      name:'Web scraping, browser & extraction',
      status:'PROVEN_MECHANISM_APPLICABLE',
      value:'Single-flight exact compatible extraction/browser work and reuse bounded results where policy permits.',
      native_first:'HTTP validators, provider cache, native browser/session reuse.',
      integration:'HTTP/provider SDK wrapper',
      proof:'/proof'
    },
    {
      id:'generated-artifacts',
      name:'Shared generated artifacts',
      status:'PROVEN_MECHANISM_APPLICABLE',
      value:'Generate once when all callers explicitly accept one shared artifact and diversity is not required.',
      native_first:'Existing asset cache/content-addressed storage.',
      integration:'Generation-tool wrapper',
      proof:'/proof'
    },
    {
      id:'inventory',
      name:'Inventory & availability monitoring',
      status:'VALIDATED_VERTICAL',
      value:'Avoid repeated paid extraction/analysis while the authoritative inventory state is unchanged; force fresh work when the state token changes.',
      native_first:'Retailer Product API, webhook/feed events and provider cache. If the native state endpoint fully answers the need, SeenRelay should self-reject.',
      integration:'State monitor + extraction/analysis guard',
      proof:'/proof'
    },
    {
      id:'news',
      name:'News & event-driven monitoring',
      status:'VALIDATED_VERTICAL',
      value:'Use a native event identity to avoid repeating paid downstream search/briefing while the event is unchanged, and force a fresh briefing on event transition.',
      native_first:'Feeds, webhooks, publisher updates and search-provider cache.',
      integration:'Event-state fingerprint + search/retrieval middleware',
      proof:'/proof'
    },
    {
      id:'ai-gateway-cold-misses',
      name:'AI gateway cold concurrent cache misses',
      status:'VALIDATED_VERTICAL',
      value:'Coalesce exact simultaneous requests before a downstream response cache becomes warm, then let the native cache handle subsequent requests.',
      native_first:'Exact/semantic response cache remains first-class; SeenRelay targets only the residual in-flight miss window.',
      integration:'Single-flight wrapper immediately in front of the AI gateway/cache',
      proof:'/proof'
    },
    {
      id:'sports',
      name:'Live sports & broadcast data',
      status:'EXPERIMENTAL',
      value:'Fan out one qualified live-state observation and reduce repeated recovery/polling or downstream analysis.',
      native_first:'Official push feeds and licensed event streams.',
      integration:'Stream freshness monitor + local fan-out'
    },
    {
      id:'logistics',
      name:'Logistics, tracking & ETA state',
      status:'EXPERIMENTAL',
      value:'Avoid repeated status analysis while shipment/fleet state is unchanged.',
      native_first:'Carrier push/webhook/state feeds.',
      integration:'Status/state middleware'
    },
    {
      id:'finance-snapshots',
      name:'Financial reference, snapshots & derived analysis',
      status:'EXPERIMENTAL',
      value:'Coordinate repeated analysis of the same explicit market/reference snapshot.',
      native_first:'Streaming market feeds, subscriptions and provider-native snapshots.',
      integration:'Snapshot-aware analysis guard'
    },
    {
      id:'threat-intel',
      name:'Threat intelligence & reputation',
      status:'EXPERIMENTAL',
      value:'Reduce repeated paid reputation/lookups inside explicit short freshness windows.',
      native_first:'Vendor cache, feeds and local IOC stores.',
      integration:'Security enrichment middleware'
    },
    {
      id:'geocoding',
      name:'Geocoding & enrichment',
      status:'EXPERIMENTAL',
      value:'Coordinate exact stable lookups where provider terms and freshness semantics permit.',
      native_first:'Local/reference caches and provider-native batching.',
      integration:'API wrapper'
    },
    {
      id:'web-traffic-analysis',
      name:'Web traffic / observability analysis',
      status:'EXPERIMENTAL',
      value:'Avoid repeated expensive query, enrichment or AI analysis of the same traffic window/watermark.',
      native_first:'OpenTelemetry/eBPF collection, materialized queries and SIEM-native aggregation.',
      integration:'OTel/SIEM/query middleware'
    },
    {
      id:'iot-edge',
      name:'Large-scale IoT / edge analytics',
      status:'EXPERIMENTAL',
      value:'One expensive downstream analysis per authoritative machine-state version; re-analyze when state changes.',
      native_first:'MQTT, OPC UA PubSub, Sparkplug state/session semantics.',
      integration:'Edge analysis guard above native state transport'
    },
    {
      id:'blockchain-rpc',
      name:'Blockchain RPC & agentic chain reads',
      status:'EXPERIMENTAL',
      value:'Coordinate block-pinned compatible reads, simulations and analysis while revalidating changing head state.',
      native_first:'Subscriptions, batching, Multicall and provider-native controls.',
      integration:'Block-aware JSON-RPC proxy or SDK transport'
    },
    {
      id:'interblockchain',
      name:'Inter-blockchain status & finality evidence',
      status:'EXPERIMENTAL',
      value:'Coordinate repeated cross-chain status/finality observations above interoperability transports.',
      native_first:'Quant Overledger, CCIP, LayerZero, Hyperlane, IBC events and protocol lifecycle.',
      integration:'Cross-chain status/evidence guard'
    },
    {
      id:'robotics',
      name:'Robotics & autonomous fleets',
      status:'RESEARCH',
      value:'Share expensive analysis of identical state/frame evidence and enforce decision-time freshness before dependent actions.',
      native_first:'Real-time control loops, sensor fusion, DDS QoS and safety mechanisms.',
      integration:'Supervisory/analysis layer only'
    },
    {
      id:'space',
      name:'Spacecraft, satellites & remote operations',
      status:'RESEARCH',
      value:'Avoid repeated analysis/compute on identical telemetry while respecting scarce communication and mission freshness.',
      native_first:'DTN, mission control and authoritative spacecraft protocols.',
      integration:'Analysis/evidence layer only'
    },
    {
      id:'medical',
      name:'Medical data & clinical monitoring',
      status:'RESEARCH',
      value:'Coordinate versioned downstream analysis and detect stale evidence without replacing clinical source-of-truth mechanisms.',
      native_first:'FHIR Subscription, device-native streams and clinical safety controls.',
      integration:'Tenant-local downstream analysis only'
    },
    {
      id:'aviation',
      name:'Aviation situational data',
      status:'RESEARCH',
      value:'Potential freshness/fan-out coordination for auxiliary state and downstream analysis.',
      native_first:'Authoritative surveillance/weather/operational streams.',
      integration:'Non-control supervisory layer'
    },
    {
      id:'industrial-control',
      name:'Industrial automation & digital twins',
      status:'RESEARCH',
      value:'Avoid repeated supervisory analytics on unchanged state; never suppress hard real-time control/safety execution.',
      native_first:'OPC UA, PLC/control loops and safety interlocks.',
      integration:'Supervisory analytics layer'
    },
    {
      id:'energy-grid',
      name:'Energy grid & critical infrastructure',
      status:'RESEARCH',
      value:'Coordinate downstream situational analysis with explicit evidence-age constraints.',
      native_first:'Protection systems, SCADA/telemetry and grid-native controls.',
      integration:'Supervisory evidence layer only'
    }
  ]
} as const;

function esc(v:unknown):string{return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}

export function useCaseAtlasDescriptor(origin:string){
  return {...publicUseCaseAtlas,canonical_origin:origin,urls:{human:origin+'/use-cases',machine:origin+'/use-cases.json',proof:origin+'/proof',integrations:origin+'/clients'}};
}

export function useCaseAtlasPage(origin:string):string{
  const cards=publicUseCaseAtlas.cases.map(c=>`
  <article class="rv-card">
    <span class="rv-number">${esc(c.status.replaceAll('_',' '))}</span>
    <h3>${esc(c.name)}</h3>
    <p>${esc(c.value)}</p>
    <p class="rv-small"><b>Native first:</b> ${esc(c.native_first)}</p>
    <p class="rv-small"><b>Integration:</b> ${esc(c.integration)}</p>
    ${'proof' in c?'<a href="/proof">Measured proof →</a>':''}
  </article>`).join('');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="SeenRelay use-case atlas: validated, experimental and research domains with native-first boundaries.">
<link rel="canonical" href="${origin}/use-cases"><link rel="alternate" type="application/json" href="${origin}/use-cases.json">
<meta name="theme-color" content="#080a0e"><meta name="color-scheme" content="dark">
<link rel="icon" href="/seenrelay-logo.svg" type="image/svg+xml"><title>Use-case Atlas — SeenRelay</title>
<link rel="stylesheet" href="/revamp.css"><link rel="stylesheet" href="/sota.css"><link rel="stylesheet" href="/funnel.css">
</head><body class="revamp"><a class="rv-skip" href="#main-content">Skip to content</a>
<header class="rv-nav"><a class="rv-brand" href="/"><span class="rv-mark" aria-hidden="true"></span>SeenRelay</a>
<nav class="rv-nav-links"><a href="/#how">How it works</a><a href="/use-cases">Use cases</a><a href="/clients">Integrations</a><a href="/proof">Proof</a><a href="/trust">Trust</a></nav>
<div class="rv-nav-actions"><a class="rv-button primary" href="/#start">Start locally</a></div></header>
<main id="main-content">
<section class="rv-shell rv-page-hero"><div class="rv-eyebrow">USE-CASE ATLAS</div><h1>Where SeenRelay may belong — and how strong the evidence is.</h1>
<p>Validated means we have domain-specific controlled evidence. Experimental means the structure looks promising but the vertical has not earned a promoted claim. Research means safety/domain validation is still required.</p>
<div class="rv-actions"><a class="rv-button primary" href="/proof">See measured proof</a><a class="rv-button" href="/use-cases.json">Machine-readable atlas</a></div></section>
<section class="rv-shell rv-section"><div class="rv-grid-3">${cards}</div></section>
<section class="rv-shell rv-final"><div><div class="rv-eyebrow">ADOPTION</div><h2>Start with the mechanism, not the industry label.</h2><p>Choose a validated or structurally matching read-only path, keep native controls first, and use the narrowest supported integration. Research domains are not an invitation to place SeenRelay inside safety-critical control loops.</p></div><div class="rv-actions"><a class="rv-button primary" href="/clients">Integrations</a><a class="rv-button" href="/quickstart">Quickstart</a></div></section>
</main></body></html>`;
}
