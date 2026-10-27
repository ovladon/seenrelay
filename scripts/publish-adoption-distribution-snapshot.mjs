import fs from 'node:fs/promises';

const report=JSON.parse(await fs.readFile('distribution-radar-report.json','utf8'));
const metrics=report.metrics||{};
const checks=Array.isArray(report.checks)?report.checks:[];
const snapshot={
  schema_version:'seenrelay-adoption-distribution-public-v1',
  collected_at:report.generated_at,
  checked_surfaces:checks.length,
  healthy_surfaces:checks.filter((x)=>x?.status==='ok').length,
  npm_downloads_7d:Number.isInteger(metrics.npm_downloads_7d)?metrics.npm_downloads_7d:null,
  github_stars:Number.isInteger(metrics.github_stars)?metrics.github_stars:null,
  github_forks:Number.isInteger(metrics.github_forks)?metrics.github_forks:null,
  mcpfield_installs:Number.isInteger(metrics.mcpfield_installs)?metrics.mcpfield_installs:null,
  signals:Object.fromEntries(checks.map((x)=>[String(x.id),{
    status:x.status,
    severity:x.severity,
    detail:x.detail
  }])),
  claim_boundary:{
    public_reach_context_only:true,
    unique_users:'UNKNOWN',
    unique_companies:'UNKNOWN',
    paying_customers:'UNKNOWN',
    geography:'UNKNOWN'
  }
};
await fs.mkdir('public',{recursive:true});
await fs.writeFile('public/adoption-distribution-latest.json',JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({event:'adoption_distribution_snapshot',...snapshot,signals:undefined}));
