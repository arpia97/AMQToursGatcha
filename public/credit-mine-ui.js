import {cardComparator,rarityOrder} from './card-display.js';
import {cardMatcher} from './search.js';
function duration(ms){
  const minutes=Math.ceil(Math.max(0,ms)/60000);
  return minutes>=60?Math.floor(minutes/60)+'h '+minutes%60+'m':minutes+'m';
}

export async function mountCreditMine({root,state,demo,api,execute,escape:e,cardBy,image,cardHTML,modal}){
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
        const badge=s.working?s.status:'Shift complete';
        return `<article class="mine-worker" data-mood="${s.working?e(s.status):'Off duty'}"><div class="mine-portrait">${image({...c,image:stock?.portrait||c.image})}
          ${badge?`<strong class="mine-status">${e(badge)}</strong>`:''}</div>
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
          const inventory=state.inventory.map(item=>({item,card:cardBy(item.card)}))
            .filter(({item,card})=>item.copies>0&&!assigned.has(item.card)&&card?.rarity);
          modal(`<h2>Assign a card</h2><div class="fusion-filters" data-filter-scope="mine-picker" data-mine-filters>
            <input type="search" class="search" placeholder="Search cards or anime…" aria-label="Search cards or anime">
            <label>Type<select name="kind"><option value="">Characters + Seiyuus</option><option value="character">Characters</option><option value="seiyuu">Seiyuus</option></select></label>
            <label>Rarity<select name="rarity"><option value="">All rarities</option>${rarityOrder.map(r=>`<option>${e(r)}</option>`).join('')}</select></label>
            <label>Sort by<select name="sort"><option value="rarity">Highest rarity</option><option value="rarity-low">Lowest rarity</option><option value="level">Highest level</option><option value="name">Name</option></select></label>
            <label><input type="checkbox" name="favorite"> Favorites only</label></div><div data-mine-results></div>`,true);
          const dialog=document.querySelector('#modal'),filters=dialog.querySelector('[data-mine-filters]'),results=dialog.querySelector('[data-mine-results]');
          let page=1;
          function show(){
            const value=name=>filters.querySelector('[name="'+name+'"]').value;
            const matches=cardMatcher(filters.querySelector('input.search').value),sort=value('sort');
            const favorites=filters.querySelector('[name="favorite"]').checked?new Set(state.cardFavorites):null;
            const compare=cardComparator(sort==='level'?'rarity':sort);
            const rows=inventory.filter(({item,card})=>(!value('kind')||card.kind===value('kind'))&&
              (!value('rarity')||card.rarity===value('rarity'))&&(!favorites||favorites.has(item.card))&&matches(card))
              .sort((a,b)=>(sort==='level'?b.item.level-a.item.level:0)||compare(a.card,b.card));
            const pages=Math.max(1,Math.ceil(rows.length/24));
            page=Math.min(pages,Math.max(1,page));
            const tiles=rows.slice((page-1)*24,page*24).map(({item,card})=>{
              const wear=resting.get(item.card);
              return `<article class="alchemy-material-choice"><button type="button" class="alchemy-material-toggle" data-assign="${e(item.card)}" aria-label="Assign ${e(card.name)}">
                ${cardHTML(card,null,{preview:true,level:item.level,portrait:item.portrait,mineStatus:wear?.status})}<span class="alchemy-selection-mark">Assign</span></button>
                <small>${wear?.efficiency??100}% efficiency</small></article>`;
            }).join('');
            results.innerHTML=`<p class="form-hint">${rows.length} matching cards</p><div class="card-grid alchemy-material-grid">${tiles||'<p>No eligible cards found.</p>'}</div>`+
              (pages>1?`<div class="toolbar space-top"><button class="button secondary" data-step="-1" ${page===1?'disabled':''}>Previous</button><span>Page ${page} of ${pages}</span><button class="button secondary" data-step="1" ${page===pages?'disabled':''}>Next</button></div>`:'');
          }
          show();
          filters.oninput=()=>{page=1;show();};
          results.onclick=ev=>{
            const target=ev.target.closest('button');
            if(target?.dataset.assign)void execute('credit-mine',{op:'assign',card:target.dataset.assign});
            if(target?.dataset.step){page+=Number(target.dataset.step);show();filters.scrollIntoView({block:'nearest'});}
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
