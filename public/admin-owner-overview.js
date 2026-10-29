/* Advisory-only owner summary of existing authenticated operational telemetry. */
(()=>{
'use strict';
const g=globalThis;
function validCount(x){
  if(x===null||x===undefined||x==='')return null;
  const n=Number(x);return Number.isSafeInteger(n)&&n>=0?n:null;
}
const count=v=>v===null?'UNKNOWN':new Intl.NumberFormat('en-US').format(v);
function when(value,clock=Date.now()){
  if(typeof value!=='string'||!value)return 'not recorded';
  const ms=Date.parse(value);if(!Number.isFinite(ms))return 'not recorded';
  const age=Math.max(0,Math.floor((clock-ms)/1000));
  if(age<60)return 'less than a minute ago';
  if(age<3600){const n=Math.floor(age/60);return n+' minute'+(n===1?'':'s')+' ago';}
  if(age<86400){const n=Math.floor(age/3600);return n+' hour'+(n===1?'':'s')+' ago';}
  const n=Math.floor(age/86400);return n+' day'+(n===1?'':'s')+' ago';
}
function model(snapshot,clock=Date.now()){
  const a=snapshot?.adoption;
  const good=a?.status==='ok'&&a.summary&&typeof a.summary==='object';
  const s=good?a.summary:{};
  const external=good?validCount(s.leases_external):null;
  const active=good?validCount(s.active_external_5m):null;
  const checks=good?validCount(s.checks_external_retained):null;
  const observes=good?validCount(s.observations_external):null;
  const qualified=good?validCount(s.reuse_external_qualified_cross_client_total):null;
  const voluntary=snapshot?.adoption_atlas?.status==='ok'?validCount(snapshot?.adoption_atlas?.summary?.reports_30d??snapshot?.adoption_atlas?.summary?.reports_total):null;
  const mode=snapshot?.controls?.mode||'UNKNOWN';
  const disabled=snapshot?.readiness?.operations?.gates?.payments_disabled;
  const billing=disabled===true?'OFF':disabled===false?'ON — REVIEW NOW':'UNKNOWN';
  const age=good?when(s.last_external_activity_at,clock):'not available';
  let next;
  if(!good)next='First restore external-activity classification. We cannot tell whether the hosted service has external usage right now.';
  else if(external===null||qualified===null)next='Some adoption counters are missing. Check data collection before interpreting the result.';
  else if(external===0)next='No classified external hosted leases in the retained dataset. Prioritize one independent, opt-in end-to-end audit; local-only users are invisible here.';
  else if(qualified===0)next='External protocol use exists, but no retained qualified cross-client reuse is demonstrated. Inspect a real external workload before claiming savings.';
  else next='Technical cross-client reuse is recorded. Seek customer-approved cost data and compare against native controls before claiming net savings.';
  const warning=mode==='NORMAL'?'Running normally':mode==='UNKNOWN'?'Runtime status unknown':'Non-normal mode: '+mode+' (review operational controls)';
  return {
    captured_at:typeof snapshot?.now==='string'?snapshot.now:null,
    headline:good?(external===null?'External count unavailable':external===0?'No retained external hosted leases recorded':'External hosted activity recorded'):'Adoption visibility unavailable',
    headline_detail:good?count(external)+' retained external protocol leases; last external activity '+age+'. These are not unique people or companies.':'No external counts are inferred while classification is unavailable.',
    cards:[
      {title:'1 · Are outsiders using it?',value:count(external),label:'Retained external protocol leases',
       detail:'CHECK '+count(checks)+' · OBSERVE '+count(observes)+' · active leases in last 5 minutes '+count(active)+'. Technical events, not customers.'},
      {title:'2 · Has evidence been reused?',value:count(qualified),label:'Qualified cross-client reuse events',
       detail:'Cross-client technical evidence only. Not necessarily a paid call avoided, monetary savings or a customer.'},
      {title:'3 · Do we know real savings?',value:'NOT MEASURED',label:'External customer net savings',
       detail:'This dashboard has no independent customer bill, best-native comparator or monetized implementation overhead.'},
      {title:'4 · Are we earning money?',value:'UNKNOWN',label:'Customers and income not tracked here',
       detail:'SeenRelay billing setting: '+billing+'. Free service and absent sales telemetry do not independently prove zero income.'}
    ],
    signals:[
      {title:'Runtime',detail:warning},
      {title:'Optional local reports',detail:count(voluntary)+' reports in the available 30-day/retained summary. Opt-in reports are not unique users or verified savings.'},
      {title:'Public reach',detail:'Installs, downloads and directory listings are discovery signals, not confirmed usage. See Adoption Atlas below.'},
      {title:'Next priority',detail:next}
    ]
  };
}
function add(parent,tag,className,value){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(value!==undefined)el.textContent=String(value);
  parent.appendChild(el);return el;
}
function render(snapshot){
  const parent=document.querySelector('.grid');if(!parent)return;
  let root=document.getElementById('owner-overview');
  if(!root){root=document.createElement('section');root.id='owner-overview';root.className='card span-12 owner-overview';parent.insertBefore(root,parent.firstElementChild)}
  root.replaceChildren();
  const data=model(snapshot);
  const header=add(root,'div','owner-overview-head');
  const title=add(header,'div','');
  add(title,'h2','','Owner overview · start here');
  add(title,'p','owner-sub','What we can verify about adoption, value and money — without confusing activity with customers.');
  const stamp=add(header,'span','owner-stamp',data.captured_at?'Snapshot: '+data.captured_at:'Snapshot time unavailable');
  stamp.setAttribute('aria-label','Snapshot timestamp');
  const verdict=add(root,'div','owner-verdict');
  add(verdict,'strong','',data.headline);
  add(verdict,'p','',data.headline_detail);
  const cardArea=add(root,'div','owner-card-grid');
  for(const card of data.cards){
    const box=add(cardArea,'div','owner-card');
    add(box,'span','owner-card-title',card.title);
    add(box,'strong','owner-card-value',card.value);
    add(box,'span','owner-card-label',card.label);
    add(box,'p','owner-card-detail',card.detail);
  }
  const statusArea=add(root,'div','owner-signal-grid');
  for(const entry of data.signals){
    const box=add(statusArea,'div','owner-signal');
    add(box,'strong','',entry.title);
    add(box,'p','',entry.detail);
  }
  const glossary=add(root,'details','owner-glossary');
  add(glossary,'summary','','What do these numbers mean? Read the plain-language guide');
  const dl=add(glossary,'dl','');
  for(const [k,v] of [
    ['Lease','A temporary pseudonymous technical client handle. One person, agent or service may have several; it is not a user account.'],
    ['CHECK','An agent asks whether a compatible recent observation exists. A CHECK is not proof that a billable provider call was saved.'],
    ['OBSERVE','A client submits an observation after obtaining evidence. It is not a newly acquired customer.'],
    ['Qualified cross-client reuse','An external consumer reused qualifying evidence from another external contributor under the platform’s classification rules. Technical use is not verified financial benefit.'],
    ['Retained','Counts reflect records still in the database and their retention policy, not all-time historic adoption.'],
    ['Local/opt-in','Client-only runs are invisible to the hosted service unless a user voluntarily shares an aggregate report.'],
    ['Adoption Atlas','An evidence-strength index combining hosted, voluntary and public-reach signals. A score is not a number of users.'],
    ['Money','income, infrastructure invoices, external customer bill reduction, margin and purchasing intent require independent evidence not stored in this panel.']
  ]){add(dl,'dt','',k);add(dl,'dd','',v)}
  add(root,'p','owner-technical-note','Below: technical operations, adoption diagnostics, safety and incident controls. You do not need to change runtime controls to review business progress.');
}
g.SeenRelayOwnerOverview={model,render};
})();
