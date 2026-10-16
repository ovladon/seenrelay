import { recordAdoptionDistributionSnapshot, type AdoptionDistributionSnapshot } from './adoption-atlas-distribution-db.js';

type ProbeStatus = 'ok' | 'fail';
type Probe = { status: ProbeStatus; detail: string; value?: number | null };

const UA = 'SeenRelay-Adoption-Atlas/1.0 (+https://seenrelay.com)';

async function getText(url:string, fetchImpl:typeof fetch):Promise<string> {
  const response=await fetchImpl(url,{
    headers:{'user-agent':UA,accept:'*/*'},
    redirect:'follow',
    signal:AbortSignal.timeout(10_000)
  });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function getJson(url:string, fetchImpl:typeof fetch):Promise<any> {
  const response=await fetchImpl(url,{
    headers:{'user-agent':UA,accept:'application/json'},
    redirect:'follow',
    signal:AbortSignal.timeout(10_000)
  });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function probe(fn:()=>Promise<{detail:string;value?:number|null}>):Promise<Probe> {
  try {
    const result=await fn();
    return {status:'ok',detail:result.detail,value:result.value ?? null};
  } catch(error) {
    return {status:'fail',detail:error instanceof Error?error.message:'unknown'};
  }
}

function nonnegative(value:unknown):number|null {
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?Math.trunc(n):null;
}

export async function collectAdoptionDistributionSnapshot(fetchImpl:typeof fetch=globalThis.fetch):Promise<AdoptionDistributionSnapshot> {
  if(typeof fetchImpl!=='function') throw new Error('fetch implementation is unavailable');

  const [npm,github,mcpfield,mcpRegistry,glama,agentPlugins,claudeCommunity]=await Promise.all([
    probe(async()=>{
      const body=await getJson('https://api.npmjs.org/downloads/point/last-week/seenrelay',fetchImpl);
      const value=nonnegative(body?.downloads);
      if(value===null) throw new Error('npm downloads response missing downloads');
      return {detail:`${value} package downloads in last-week window`,value};
    }),
    probe(async()=>{
      const body=await getJson('https://api.github.com/repos/ovladon/seenrelay',fetchImpl);
      if(body?.full_name!=='ovladon/seenrelay') throw new Error('canonical GitHub repository not returned');
      const stars=nonnegative(body?.stargazers_count);
      const forks=nonnegative(body?.forks_count);
      if(stars===null||forks===null) throw new Error('GitHub repository metrics missing');
      return {detail:`${stars} stars; ${forks} forks`,value:stars*1_000_000+forks};
    }),
    probe(async()=>{
      const text=await getText('https://mcpfield.com/en/skills/seenrelay',fetchImpl);
      if(!/SeenRelay/i.test(text)) throw new Error('MCPField page does not identify SeenRelay');
      const match=text.match(/([0-9][0-9,.]*)\s*(?:installs?|installations?)/i);
      const installs=match?nonnegative(match[1].replaceAll(',','')):null;
      return {detail:installs===null?'SeenRelay listing reachable; install count not parseable':`${installs} displayed installs`,value:installs};
    }),
    probe(async()=>{
      const body=await getJson('https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ovladon%2Fseenrelay',fetchImpl);
      const text=JSON.stringify(body);
      if(!text.includes('io.github.ovladon/seenrelay')) throw new Error('official MCP Registry search does not identify SeenRelay');
      return {detail:'official MCP Registry listing discoverable'};
    }),
    probe(async()=>{
      const text=await getText('https://glama.ai/mcp/connectors?query=SeenRelay',fetchImpl);
      if(!/SeenRelay/i.test(text)) throw new Error('Glama search does not identify SeenRelay');
      return {detail:'Glama discovery identifies SeenRelay'};
    }),
    probe(async()=>{
      const text=await getText('https://agent-plugins.directory/ovladon/seenrelay',fetchImpl);
      if(!/SeenRelay/i.test(text)) throw new Error('Agent Plugins Directory does not identify SeenRelay');
      return {detail:'Agent Plugins Directory listing reachable'};
    }),
    probe(async()=>{
      const body=await getJson('https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json',fetchImpl);
      const plugins=Array.isArray(body?.plugins)?body.plugins:[];
      const found=plugins.some((entry:any)=>entry?.name==='seenrelay'&&JSON.stringify(entry).includes('ovladon/seenrelay'));
      if(!found) throw new Error('Claude community marketplace mirror does not identify canonical SeenRelay');
      return {detail:'Claude community marketplace mirror lists canonical SeenRelay'};
    })
  ]);

  const signals={npm,github,mcpfield,mcp_registry:mcpRegistry,glama,agent_plugins:agentPlugins,claude_community:claudeCommunity};
  const values=Object.values(signals);
  const githubPacked=github.status==='ok'&&typeof github.value==='number'?github.value:null;
  const githubStars=githubPacked===null?null:Math.floor(githubPacked/1_000_000);
  const githubForks=githubPacked===null?null:githubPacked%1_000_000;
  return {
    collected_at:new Date().toISOString(),
    checked_surfaces:values.length,
    healthy_surfaces:values.filter(x=>x.status==='ok').length,
    npm_downloads_7d:npm.status==='ok'?nonnegative(npm.value):null,
    github_stars:githubStars,
    github_forks:githubForks,
    mcpfield_installs:mcpfield.status==='ok'?nonnegative(mcpfield.value):null,
    signals
  };
}

export async function runAdoptionAtlasDistributionCycle(fetchImpl:typeof fetch=globalThis.fetch) {
  const snapshot=await collectAdoptionDistributionSnapshot(fetchImpl);
  await recordAdoptionDistributionSnapshot(snapshot);
  return {
    version:'adoption-atlas-distribution-cycle-v1',
    classification:'public-distribution-context-not-adoption',
    snapshot
  };
}
