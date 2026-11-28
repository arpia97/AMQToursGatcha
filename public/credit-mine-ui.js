function duration(ms){
  const minutes=Math.ceil(Math.max(0,ms)/60000);
  return minutes>=60?Math.floor(minutes/60)+'h '+minutes%60+'m':minutes+'m';
}

export async function mountCreditMine({root,state,demo,api,execute,escape:e,cardBy,image,modal}){
  root.className='credit-mine';
  root.innerHTML=`<header class="mine-hero"><div><h1>Aoji Credit Mine</h1>
    <p>Purge your capitalist enemies and sentence them to revolutionary labor in the coal mines as a sign of absolute devotion to the Supreme Leader.</p></div><img class="mine-aoji" src="aoji-miner.webp" width="420" height="404" alt=""></header><section class="mine-crew"></section>`;
  const body=root.querySelector('.mine-crew');
  if(demo||!state.me){
    body.innerHTML=demo?'Open the Gacha site to work a shift.':'<button class="button" data-action="account">Sign in</button>';
    return;
  }
  async function load(){
    try{
      const data=await api('credit-mine');
      if(!root.isConnected)return;
      const workers=data.shifts.length;
      const assigned=new Set(data.shifts.map(s=>s.card));
      const resting=new Map(data.resting.map(s=>[s.card,s]));
      function worker(s){
        const c=cardBy(s.card),stock=state.inventory.find(i=>i.card===s.card);
        return `<article class="mine-worker" data-mood="${s.working?e(s.status):'Off duty'}"><div class="mine-portrait">${image({...c,image:stock?.portrait||c.image})}
          <strong class="mine-status">${s.working?e(s.status):'Shift complete'}</strong></div>
          <div class="mine-worker-info"><h3>${e(c.name)}</h3><small>${e(c.rarity||'')} · Lv. ${s.level}</small>
          ${s.working?`<div class="mine-eff"><span>Efficiency</span><b>${s.efficiency}%</b></div><progress class="mine-meter" aria-label="Mining efficiency" max="100" value="${s.efficiency}"></progress><small>${duration(data.now-s.start)} worked</small>`:'<p>Ready to collect</p>'}
          <strong>✦ ${s.available.toLocaleString()} credits</strong></div>
          <div class="mine-actions"><button class="button" data-op="collect" data-card="${e(s.card)}" ${s.working&&!s.available?'disabled':''}>Collect</button>
          ${s.working?`<button class="text-button" data-card="${e(s.card)}" data-op="recall">Recall</button>`:''}</div></article>`;
      }
      body.innerHTML=`<header class="mine-roster"><h2>Mining crew <small>${workers} / ${data.slots}</small></h2>
        <button class="button" data-op="pick" ${workers>=data.slots?'disabled':''}>Assign card</button></header>
        ${data.shifts.length?`<div class="mine-grid" data-slots="${data.slots}">${data.shifts.map(worker).join('')}</div>`:'<p class="subtext">Your crew is off duty.</p>'}
        <details class="mine-guide"><summary>Shift details</summary>
        <dl class="mine-shift-rules">
          <div><dt>Earnings</dt><dd>Cards roll for credits every 5 minutes (8.68% chance when fully rested).</dd></div>
          <div><dt>Scaling</dt><dd>Higher rarity and level yield more credits per find. A level 1 AG averages ~1,906 credits in the first 24 hours.</dd></div>
          <div><dt>Collection</dt><dd>Use "Recall" to collect your earned credits.</dd></div>
          <div><dt>Fatigue</dt><dd>Efficiency drops over time, hitting a 5% floor after 48 hours for a level 1 card.</dd></div>
          <div><dt>Leveling</dt><dd>Each extra level adds 12 more working hours before hitting the efficiency floor.</dd></div>
          <div><dt>Recovery</dt><dd>5 hours of rest undoes 1 hour of work.</dd></div>
          <div><dt>Card-Specific</dt><dd>Fatigue stays tied to the individual card.</dd></div>
        </dl></details>`;
      body.onclick=async event=>{
        const button=event.target.closest('[data-op]');
        if(!button)return;
        if(button.dataset.op==='pick'){
          const rows=state.inventory.map(i=>({i,c:cardBy(i.card)}))
            .filter(({i,c})=>!assigned.has(i.card)&&c.rarity)
            .sort((a,b)=>a.c.name.localeCompare(b.c.name));
          modal('<h2>Assign a card</h2><input type="search" class="search" placeholder="Find a card" aria-label="Find a card" data-mine-search><div class="mine-picker"></div>');
          const dialog=document.querySelector('#modal'),results=dialog.querySelector('.mine-picker');
          const show=(query='')=>{
            const matches=rows.filter(({c})=>c.name.toLowerCase().includes(query.toLowerCase()));
            results.innerHTML=matches.slice(0,100).map(({i,c})=>`<button class="button secondary" data-assign="${e(i.card)}" >
              <strong>${e(c.name)}</strong><small>${e(c.rarity)} · Lv. ${i.level}${resting.has(i.card)?' · '+e(resting.get(i.card).status)+' · '+resting.get(i.card).efficiency+'% efficiency':' · 100% efficiency'}</small></button>`).join('')||
              '<p>No eligible cards found.</p>';
            if(matches.length>100)results.insertAdjacentHTML('beforeend','<small>Search to narrow the list.</small>');
          };
          show();
          dialog.querySelector('[data-mine-search]').oninput=ev=>show(ev.target.value);
          results.onclick=ev=>{
            const target=ev.target.closest('[data-assign]');
            if(target)void execute('credit-mine',{op:'assign',card:target.dataset.assign});
          };
          return;
        }
        const shift=data.shifts.find(s=>s.card===button.dataset.card);
        if(shift)await execute('credit-mine',{op:button.dataset.op,card:shift.card,start:shift.start});
      };
      // Refresh at the next potential find, even if the tab was idle for most of the shift.
      const next=Math.min(...data.shifts.filter(s=>s.working).map(s=>300000-(data.now-s.start)%300000),
        ...data.resting.map(s=>Math.min(60000,s.readyAt-data.now)));
      if(Number.isFinite(next))setTimeout(()=>{if(root.isConnected)void load();},Math.max(1000,next+150));
    }catch(err){
      if(root.isConnected){
        body.innerHTML=`<p role="alert">${e(err.message)} <button class="text-button">Retry</button></p>`;
        body.querySelector('button').onclick=load;
      }
    }
  }
  await load();
}
