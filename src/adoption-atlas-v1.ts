export type AdoptionAtlasConfidence = 'NOT_YET_OBSERVED' | 'EMERGING' | 'CONFIRMED' | 'STRONG';

function n(value:unknown):number {
  const x=Number(value??0);
  return Number.isFinite(x)&&x>=0?x:0;
}
function dateAgeDays(value:unknown, nowMs:number):number|null {
  if(typeof value!=='string'||!value) return null;
  const t=Date.parse(value);
  return Number.isFinite(t)?Math.max(0,(nowMs-t)/86_400_000):null;
}

export function buildAdoptionAtlasV1(input:{
  hosted?:{status?:unknown;summary?:Record<string,unknown>}|null;
  voluntary?:{status?:unknown;summary?:Record<string,unknown>;cells?:unknown[]}|null;
  distribution?:{status?:unknown;snapshot?:Record<string,unknown>|null}|null;
  now?:string;
}) {
  const nowMs=Date.parse(input.now||new Date().toISOString());
  const hostedOk=input.hosted?.status==='ok';
  const hs=hostedOk?(input.hosted?.summary||{}):{};
  const voluntaryOk=input.voluntary?.status==='ok';
  const vs=voluntaryOk?(input.voluntary?.summary||{}):{};
  const cells=voluntaryOk&&Array.isArray(input.voluntary?.cells)?input.voluntary!.cells as any[]:[];
  const distributionOk=input.distribution?.status==='ok'&&Boolean(input.distribution?.snapshot);
  const ds=distributionOk?(input.distribution!.snapshot||{}):{};

  const retained=n(hs.leases_external);
  const repeat=n(hs.leases_external_repeat);
  const bidirectional=n(hs.leases_external_bidirectional);
  const qualifiedEvents=n(hs.reuse_external_qualified_cross_client_total);
  const qualifiedConsumers=n(hs.reuse_external_qualified_consumer_leases);
  const lastHostedAge=dateAgeDays(hs.last_external_activity_at,nowMs);

  let directScore=0;
  if(retained>0) directScore+=8;
  if(repeat>0) directScore+=12;
  if(bidirectional>0) directScore+=12;
  if(lastHostedAge!==null&&lastHostedAge<=7) directScore+=8;

  let qualifiedScore=0;
  if(qualifiedEvents>0) qualifiedScore+=10;
  if(qualifiedConsumers>0) qualifiedScore+=10;

  const reportsTotal=n(vs.reports_total);
  const reports7d=n(vs.reports_7d);
  const activeReports=n(vs.active_reports);
  const useReports=n(vs.use_reports);
  const deploymentBreadth=new Set(cells.filter(c=>n(c?.reports)>0).map(c=>String(c?.deployment_class||'')).filter(Boolean)).size;
  let voluntaryScore=0;
  if(reportsTotal>0) voluntaryScore+=4;
  if(reports7d>0) voluntaryScore+=4;
  if(activeReports>0) voluntaryScore+=5;
  if(useReports>0) voluntaryScore+=5;
  if(deploymentBreadth>=2) voluntaryScore+=2;

  const checked=n(ds.checked_surfaces);
  const healthy=n(ds.healthy_surfaces);
  const npmDownloads=n(ds.npm_downloads_7d);
  const mcpfieldInstalls=n(ds.mcpfield_installs);
  const githubStars=n(ds.github_stars);
  const githubForks=n(ds.github_forks);
  const distributionAge=dateAgeDays(ds.collected_at,nowMs);
  let reachScore=0;
  if(checked>0&&healthy/checked>=0.75) reachScore+=4;
  if(npmDownloads>0) reachScore+=4;
  if(mcpfieldInstalls>0) reachScore+=6;
  if(githubStars+githubForks>0) reachScore+=3;
  if(distributionAge!==null&&distributionAge<=2) reachScore+=3;

  const adoptionEvidenceScore=Math.min(80,directScore+qualifiedScore+voluntaryScore);
  const reachContextScore=Math.min(20,reachScore);
  const triangulationScore=adoptionEvidenceScore+reachContextScore;

  const voluntaryCorroboration=reportsTotal>0;
  const independentDistributionCorroboration=mcpfieldInstalls>0||npmDownloads>0||githubStars+githubForks>0;
  const qualified=qualifiedConsumers>0||qualifiedEvents>0;
  const recentHosted=lastHostedAge!==null&&lastHostedAge<=30;

  let confidence:AdoptionAtlasConfidence='NOT_YET_OBSERVED';
  if(retained>0||reportsTotal>0||mcpfieldInstalls>0) confidence='EMERGING';
  if(
    (repeat>0||bidirectional>0||qualified) &&
    (voluntaryCorroboration||independentDistributionCorroboration)
  ) confidence='CONFIRMED';
  const corroborationClasses=[voluntaryCorroboration,independentDistributionCorroboration,qualified].filter(Boolean).length;
  if(
    retained>=2 &&
    repeat>0 &&
    bidirectional>0 &&
    qualified &&
    recentHosted &&
    corroborationClasses>=2
  ) confidence='STRONG';

  return {
    schema_version:'seenrelay-adoption-atlas-v1',
    generated_at:new Date(Number.isFinite(nowMs)?nowMs:Date.now()).toISOString(),
    confidence,
    triangulation_score:triangulationScore,
    adoption_evidence_score:adoptionEvidenceScore,
    reach_context_score:reachContextScore,
    evidence:{
      direct_hosted:{
        status:hostedOk?'available':'unavailable',
        score:directScore,
        max_score:40,
        retained_external_leases:retained,
        repeat_external_leases:repeat,
        bidirectional_external_leases:bidirectional,
        last_external_activity_at:typeof hs.last_external_activity_at==='string'?hs.last_external_activity_at:null
      },
      qualified_external:{
        status:hostedOk?'available':'unavailable',
        score:qualifiedScore,
        max_score:20,
        qualified_cross_client_reuse_events:qualifiedEvents,
        qualified_reuse_consumer_leases:qualifiedConsumers,
        meaning:'server-classified external-to-external qualified reuse; not a unique actor count'
      },
      voluntary_local:{
        status:voluntaryOk?'available':'unavailable',
        score:voluntaryScore,
        max_score:20,
        reports_total:reportsTotal,
        reports_7d:reports7d,
        active_reports:activeReports,
        use_reports:useReports,
        deployment_class_breadth:deploymentBreadth,
        meaning:'explicit opt-in unverified aggregate reports; not deduplicated'
      },
      distribution_context:{
        status:distributionOk?'available':input.distribution?.status==='empty'?'empty':'unavailable',
        score:reachContextScore,
        max_score:20,
        checked_surfaces:checked,
        healthy_surfaces:healthy,
        npm_downloads_7d:distributionOk?(ds.npm_downloads_7d??null):null,
        mcpfield_installs:distributionOk?(ds.mcpfield_installs??null):null,
        github_stars:distributionOk?(ds.github_stars??null):null,
        github_forks:distributionOk?(ds.github_forks??null):null,
        collected_at:distributionOk?(ds.collected_at??null):null,
        meaning:'public reach/discovery context only; never treated as unique users or customers'
      }
    },
    claim_boundary:{
      unique_users:'UNKNOWN',
      unique_companies:'UNKNOWN',
      paying_customers:'UNKNOWN',
      geography:'UNKNOWN',
      distribution_metrics_are_adoption:false,
      voluntary_reports_are_deduplicated:false,
      hosted_leases_are_unique_actors:false,
      hidden_client_telemetry:false
    },
    rules:{
      emerging:'at least one hosted external lease, voluntary report, or independently displayed MCPField install signal',
      confirmed:'repeat/bidirectional/qualified hosted activity plus voluntary or independent public distribution corroboration',
      strong:'multiple retained external leases + repeat + bidirectional + qualified reuse + recent hosted activity + at least two corroborating evidence classes'
    }
  };
}
