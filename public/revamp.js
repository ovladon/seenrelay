(()=>{'use strict';
const modeButtons=[...document.querySelectorAll('[data-mode-button]')];
const views=[...document.querySelectorAll('[data-install-view]')];
const modeCopy=document.querySelector('.rv-mode-card .rv-mode-copy');
const modeContent={
  agent:{title:'Start without learning SeenRelay first.',body:'The Agent Skill inspects the project, uses only a supported integration boundary and returns a decision instead of blindly enabling reuse.'},
  human:{title:'Integrate directly with the client.',body:'Install the npm or PyPI client, wrap one existing read-only validation boundary in shadow mode, and measure the real workload before enabling any reuse.'}
};
function selectMode(mode){
  modeButtons.forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.modeButton===mode)));
  views.forEach(view=>view.classList.toggle('active',view.dataset.installView===mode));
  const copy=modeContent[mode]||modeContent.human;
  if(modeCopy){
    const title=modeCopy.querySelector('h3');
    const body=modeCopy.querySelector('p');
    if(title)title.textContent=copy.title;
    if(body)body.textContent=copy.body;
  }
}
modeButtons.forEach(btn=>btn.addEventListener('click',()=>selectMode(btn.dataset.modeButton||'human')));

document.querySelectorAll('[data-copy-target]').forEach(btn=>btn.addEventListener('click',async()=>{
  const id=btn.getAttribute('data-copy-target');
  const target=id&&document.getElementById(id);
  if(!target)return;
  const value=target.textContent||'';
  try{
    await navigator.clipboard.writeText(value);
    const before=btn.textContent;
    btn.textContent='Copied';
    setTimeout(()=>{btn.textContent=before},1400);
  }catch{
    btn.textContent='Select';
    target.focus?.();
  }
}));

const liveForm=document.getElementById('live-check-form');
if(liveForm){
  const select=document.getElementById('live-check-fact');
  const known=document.getElementById('live-check-known');
  const maxAge=document.getElementById('live-check-max-age');
  const source=document.getElementById('live-check-source');
  const result=document.getElementById('live-check-result');
  const submit=liveForm.querySelector('button[type="submit"]');
  const catalogEndpoint=liveForm.dataset.catalogEndpoint||'/starter-facts.json';
  const checkEndpoint=liveForm.dataset.checkEndpoint||'/v1/check';
  let facts=[];

  function selectedFact(){
    return facts.find(entry=>entry&&entry.id===select?.value)||null;
  }

  function setSource(){
    const entry=selectedFact();
    if(!source)return;
    source.replaceChildren();
    if(!entry?.fact){
      source.textContent='Choose a fact to see its authoritative source and locator.';
      return;
    }
    const prefix=document.createElement('span');
    prefix.textContent='Authoritative source: ';
    const link=document.createElement('a');
    link.href=entry.fact.source;
    link.target='_blank';
    link.rel='noreferrer';
    link.textContent=entry.fact.source;
    const locator=document.createElement('span');
    const locatorValue=entry.fact.locator?.value||'source-defined';
    locator.textContent=` · value at ${locatorValue}`;
    source.append(prefix,link,locator);
  }

  function renderResult(status,payload={}){
    if(!result)return;
    const state=result.querySelector('.rv-live-check-state');
    if(!state)return;
    const copy={
      SAME_OBSERVED:['Compatible recent evidence matches your known value.','This is evidence, not truth and not permission to skip validation.'],
      CHANGED_OBSERVED:['Recent evidence differs from your known value.','Validate the authoritative source before relying on the change.'],
      CONTESTED:['Recent observations disagree.','Validate the authoritative source; the evidence is contested.'],
      STALE:['Known evidence is outside your chosen freshness window.','Validate the authoritative source if fresh state is required.'],
      UNKNOWN:['No usable recent evidence is available.','Validate the authoritative source if fresh state is required.'],
      ERROR:['The live CHECK could not be completed.',payload.message||'Your normal authoritative path remains available.']
    };
    const [title,body]=copy[status]||[status||'CHECK RESULT','The authoritative source remains the fallback.'];
    state.dataset.state=status==='ERROR'?'error':'complete';
    state.replaceChildren();

    const badge=document.createElement('span');
    badge.className='rv-live-check-status';
    badge.textContent=status||'RESULT';
    const heading=document.createElement('h3');
    heading.textContent=title;
    const paragraph=document.createElement('p');
    paragraph.textContent=body;
    const details=document.createElement('dl');

    const age=document.createElement('div');
    const ageDt=document.createElement('dt');
    ageDt.textContent='Evidence age';
    const ageDd=document.createElement('dd');
    ageDd.textContent=Number.isFinite(payload.age_seconds)?`${payload.age_seconds}s`:'—';
    age.append(ageDt,ageDd);

    const observers=document.createElement('div');
    const observersDt=document.createElement('dt');
    observersDt.textContent='Observers';
    const observersDd=document.createElement('dd');
    observersDd.textContent=Number.isFinite(payload.observer_count)?String(payload.observer_count):'—';
    observers.append(observersDt,observersDd);

    details.append(age,observers);
    state.append(badge,heading,paragraph,details);
  }

  fetch(catalogEndpoint,{headers:{accept:'application/json'}})
    .then(response=>{
      if(!response.ok)throw new Error(`Catalog unavailable (HTTP ${response.status})`);
      return response.json();
    })
    .then(catalog=>{
      facts=Array.isArray(catalog?.facts)?catalog.facts:[];
      if(!select)return;
      select.replaceChildren();
      const placeholder=document.createElement('option');
      placeholder.value='';
      placeholder.textContent='Choose a starter fact';
      placeholder.disabled=true;
      select.append(placeholder);
      for(const entry of facts){
        if(!entry?.id||!entry?.fact)continue;
        const option=document.createElement('option');
        option.value=entry.id;
        option.textContent=entry.fact.subject||entry.id;
        select.append(option);
      }
      const preferred=facts.find(entry=>entry?.id==='github-status-indicator')||facts[0];
      if(preferred)select.value=preferred.id;
      setSource();
    })
    .catch(error=>{
      if(select){
        select.replaceChildren();
        const option=document.createElement('option');
        option.value='';
        option.textContent='Starter catalog unavailable';
        select.append(option);
      }
      renderResult('ERROR',{message:error instanceof Error?error.message:String(error)});
    });

  select?.addEventListener('change',setSource);

  liveForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const entry=selectedFact();
    const value=known?.value??'';
    const requestedAge=Number(maxAge?.value);
    if(!entry?.fact||!value||!Number.isInteger(requestedAge)||requestedAge<1||requestedAge>604800)return;

    if(submit){
      submit.disabled=true;
      submit.textContent='Checking…';
    }

    try{
      const headers={
        accept:'application/json',
        'content-type':'application/json',
        'x-seenrelay-client':'web-starter-check'
      };
      const lease=sessionStorage.getItem('seenrelay_web_demo_lease');
      if(lease)headers['x-seenrelay-lease']=lease;

      const response=await fetch(checkEndpoint,{
        method:'POST',
        headers,
        body:JSON.stringify({
          fact:entry.fact,
          known_value:value,
          max_age_seconds:requestedAge
        })
      });
      const nextLease=response.headers.get('x-seenrelay-lease');
      if(nextLease)sessionStorage.setItem('seenrelay_web_demo_lease',nextLease);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=payload?.error?.detail||`HTTP ${response.status}`;
        throw new Error(detail);
      }
      renderResult(payload.status,payload);
    }catch(error){
      renderResult('ERROR',{message:error instanceof Error?error.message:String(error)});
    }finally{
      if(submit){
        submit.disabled=false;
        submit.textContent='Ask SeenRelay';
      }
    }
  });
}
})();