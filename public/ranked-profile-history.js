import {poolFormat} from './play-pool.js';

const modes={
  'ngmc-ranked':'NGMC 4v4',
  '1v1-ranked':'1v1 Ranked',
  '1v1':'S/A 1v1',
  '3v3':'S/A 3v3',
};
const view={mode:'ngmc-ranked',pool:'random',metric:'rating'};
const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'});
const formatRating=new Intl.NumberFormat(undefined,{maximumFractionDigits:1});
const formatRate=new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1});
const format=(value,isRate)=>isRate?formatRate.format(value/100):formatRating.format(value);

function switches(key,choices,label){
  return `<div class="rh-switch" role="group" aria-label="${label}">${Object.entries(choices).map(([value,name])=>
    `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${view[key]===value}">${name}</button>`).join('')}</div>`;
}

function plot(points,total,isRate){
  const values=points.map(p=>p.value);
  const low=values.reduce((a,b)=>Math.min(a,b)),high=values.reduce((a,b)=>Math.max(a,b));
  const pad=Math.max((high-low)*.12,isRate?2:1);
  const bottom=isRate?Math.max(0,low-pad):low-pad,top=isRate?Math.min(100,high+pad):high+pad;
  const x=n=>total===1?50:2+96*(n-1)/(total-1);
  const y=v=>100*(top-v)/(top-bottom);
  const path=points.map(p=>x(p.match)+','+y(p.value)).join(' ');
  const grid=[0,25,50,75,100];
  const ticks=Array.from({length:Math.min(total,5)},(_,i)=>1+Math.round(i*(total-1)/Math.max(1,Math.min(total,5)-1)));
  return `<div class="rh-plot"><div class="rh-scale">${grid.map(n=>`<span style="top:${n}%">${format(top-(top-bottom)*n/100,isRate)}</span>`).join('')}</div>
    <div class="rh-surface" tabindex="0" role="slider" aria-readonly="true" aria-label="${isRate?'Guess rate':'Rating'} by match" aria-valuemin="${points[0].match}" aria-valuemax="${points.at(-1).match}" aria-valuenow="${points.at(-1).match}">
    <svg width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id="ranked-fill" x1="0%" x2="0%" y1="0%" y2="100%"><stop stop-color="#94d3bd" stop-opacity=".23"/><stop offset="1" stop-color="#94d3bd" stop-opacity=".015"/></linearGradient></defs>
      ${grid.map(n=>`<line x1="0%" x2="100%" y1="${n}%" y2="${n}%" stroke="var(--border)"/>`).join('')}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        <polygon fill="url(#ranked-fill)" points="${x(points[0].match)},100 ${path} ${x(points.at(-1).match)},100"/>
        <polyline points="${path}" fill="none" stroke="#94d3bd" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>${points.map(p=>`<circle cx="${x(p.match)}%" cy="${y(p.value)}%" r="${points.length>60?2:3.3}"/>`).join('')}
    </svg><output class="rh-tip" hidden></output></div>
    <div class="rh-axis">${ticks.map(n=>`<span style="left:${x(n)}%">Match ${n}</span>`).join('')}</div></div>`;
}

function bindPlot(root,points,isRate){
  const surface=root.querySelector('.rh-surface'),tip=surface.querySelector('output'),dots=[...surface.querySelectorAll('circle')];
  let active=dots.length-1;
  function show(index){
    dots[active].classList.remove('active');
    active=index;
    const p=points[index],dot=dots[index];
    dot.classList.add('active');
    const detail=isRate?' · '+p.correct+' / '+p.possible:'';
    const label='Match '+p.match+' · '+date.format(p.playedAt);
    tip.innerHTML='<small>'+label+'</small><strong>'+format(p.value,isRate)+detail+'</strong>';
    tip.hidden=false;
    const x=dot.getAttribute('cx'),y=dot.getAttribute('cy');
    const above=dot.cy.baseVal.value>tip.offsetHeight+12;
    tip.style.left=x;
    tip.style.top=`calc(${y} ${above?'-':'+'} 9px)`;
    tip.style.translate=`-${x} ${above?'-100%':'0'}`;
    surface.setAttribute('aria-valuenow',p.match);
    surface.setAttribute('aria-valuetext',label+' · '+format(p.value,isRate)+detail);
  }
  function hide(){tip.hidden=true;dots[active].classList.remove('active');}
  function inspect(e){
    const px=e.clientX-surface.getBoundingClientRect().left;
    let lo=0,hi=dots.length-1;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(px<(dots[mid].cx.baseVal.value+dots[mid+1].cx.baseVal.value)/2)hi=mid;
      else lo=mid+1;
    }
    show(lo);
  }
  surface.onpointermove=inspect;
  surface.onclick=inspect;
  surface.onpointerleave=e=>{if(e.pointerType==='mouse')hide();};
  surface.onfocus=()=>show(active);
  surface.onblur=hide;
  surface.onkeydown=e=>{
    const next={Home:0,End:dots.length-1,ArrowLeft:active-1,ArrowRight:active+1}[e.key];
    if(next!==undefined){e.preventDefault();show(Math.max(0,Math.min(dots.length-1,next)));}
    if(e.key==='Escape')hide();
  };
}

export function mountRankedHistory(root,history){
  function render(){
    const isRate=view.metric==='rate';
    const rows=(history||[]).filter(r=>r.format===poolFormat(view.mode,view.pool));
    const points=rows.map((r,i)=>({...r,match:i+1,value:isRate?
      (r.possible>0&&Number.isFinite(r.correct)?100*r.correct/r.possible:null):r.rating})).filter(p=>Number.isFinite(p.value));
    root.innerHTML=`<h2>Ranked match history</h2>
      <div class="rh-controls">
        <div class="rh-mode-controls">
          <select aria-label="Ranked mode">${Object.entries(modes).map(([key,name])=>`<option value="${key}" ${key===view.mode?'selected':''}>${name}</option>`).join('')}</select>
          ${switches('pool',{random:'Random',watched:'Watched'},'Song selection')}
        </div>
        ${switches('metric',{rating:'Rating',rate:'Guess Rate'},'Metric')}
      </div>
      ${points.length?`<div class="rh-summary"><strong>${format(points.at(-1).value,isRate)}</strong><span>Last match · ${rows.length} ${rows.length===1?'match':'matches'} played</span></div>${plot(points,rows.length,isRate)}`:
      `<p class="rh-empty">${history==null?'Ranked history is currently unavailable.':rows.length?'No guess rate recorded for these matches.':'No completed ranked matches in this pool yet.'}</p>`}`;
    if(points.length)bindPlot(root,points,isRate);
  }
  root.onchange=e=>{if(e.target.matches('select')){view.mode=e.target.value;render();root.querySelector('select').focus();}};
  root.onclick=e=>{
    const button=e.target.closest('button[data-key]');
    if(!button)return;
    const {key,value}=button.dataset;
    view[key]=value;render();root.querySelector(`button[data-key="${key}"][data-value="${value}"]`).focus({preventScroll:true});
  };
  render();
}
