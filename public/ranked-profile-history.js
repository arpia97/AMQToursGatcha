import {poolFormat} from './play-pool.js';

const modes={
  'ngmc-ranked':'NGMC 4v4',
  '1v1-ranked':'1v1 Ranked',
  '1v1':'S/A 1v1',
  '3v3':'S/A 3v3',
};
const view={mode:'ngmc-ranked',pool:'random',metric:'rating',showTrend:false};
const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'});
const formatRating=new Intl.NumberFormat(undefined,{maximumFractionDigits:1});
const formatSmallChange=new Intl.NumberFormat(undefined,{maximumSignificantDigits:1});
const formatRate=new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1});
const format=(value,isRate)=>isRate?formatRate.format(value/100):formatRating.format(value);

function switches(key,choices,label){
  return `<div class="rh-switch" role="group" aria-label="${label}">${Object.entries(choices).map(([value,name])=>
    `<button type="button" data-key="${key}" data-value="${value}" aria-pressed="${view[key]===value}">${name}</button>`).join('')}</div>`;
}

function trendEndpoints(points){
  if(points.length<2)return [];
  const meanMatch=points.reduce((sum,p)=>sum+p.match,0)/points.length;
  const meanValue=points.reduce((sum,p)=>sum+p.value,0)/points.length;
  let covariance=0,variance=0;
  for(const p of points){
    const distance=p.match-meanMatch;
    covariance+=distance*(p.value-meanValue);
    variance+=distance*distance;
  }
  return [points[0],points.at(-1)].map(({match})=>({match,value:meanValue+(match-meanMatch)*covariance/variance}));
}

function plot(points,total,isRate){
  const trend=view.showTrend?trendEndpoints(points):[];
  const values=[...points,...trend].map(p=>p.value);
  const low=values.reduce((a,b)=>Math.min(a,b)),high=values.reduce((a,b)=>Math.max(a,b));
  const roughStep=Math.max(high-low,isRate?8:4)/4;
  const magnitude=10**Math.floor(Math.log10(roughStep));
  const step=[1,2,2.5,5,10].find(n=>n*magnitude>=roughStep)*magnitude;
  const bottom=Math.max(isRate?0:-Infinity,Math.floor((low-step*.12)/step)*step);
  const top=Math.min(isRate?100:Infinity,Math.ceil((high+step*.12)/step)*step);
  const x=n=>total===1?50:2+96*(n-1)/(total-1);
  const y=v=>100*(top-v)/(top-bottom);
  const path=points.map(p=>x(p.match)+','+y(p.value)).join(' ');
  const grid=[];
  for(let value=bottom;value<=top;value+=step)grid.push(value);
  const ticks=Array.from({length:Math.min(total,5)},(_,i)=>1+Math.round(i*(total-1)/Math.max(1,Math.min(total,5)-1)));
  return `<div class="rh-plot"><div class="rh-scale">${grid.map(n=>`<span style="top:${y(n)}%">${format(n,isRate)}</span>`).join('')}</div>
    <div class="rh-surface" tabindex="0" role="slider" aria-readonly="true" aria-label="${isRate?'Guess rate':'Rating'} by match" aria-valuemin="${points[0].match}" aria-valuemax="${points.at(-1).match}" aria-valuenow="${points.at(-1).match}">
    <svg width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id="ranked-fill" x1="0%" x2="0%" y1="0%" y2="100%"><stop stop-color="#94d3bd" stop-opacity=".23"/><stop offset="1" stop-color="#94d3bd" stop-opacity=".015"/></linearGradient></defs>
      ${grid.map(n=>`<line x1="0%" x2="100%" y1="${y(n)}%" y2="${y(n)}%" stroke="var(--border)"/>`).join('')}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        <polygon fill="url(#ranked-fill)" points="${x(points[0].match)},100 ${path} ${x(points.at(-1).match)},100"/>
        <polyline points="${path}" fill="none" stroke="#94d3bd" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        ${trend.length?`<polyline class="rh-trend" points="${trend.map(p=>x(p.match)+','+y(p.value)).join(' ')}" fill="none" stroke-width="1.8" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`:''}
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
    let changeText='',changeMarkup='';
    if(!isRate && Number.isFinite(p.ratingChange)){
      const amount=Math.abs(p.ratingChange);
      const direction=Math.sign(p.ratingChange);
      const sign=direction>0?'+':direction<0?'−':'';
      const magnitude=(amount<0.05?formatSmallChange:formatRating).format(amount);
      changeText=' ('+sign+magnitude+')';
      changeMarkup='<span class="rh-change" data-direction="'+direction+'">'+changeText+'</span>';
    }
    tip.innerHTML='<small>'+label+'</small><strong>'+format(p.value,isRate)+detail+changeMarkup+'</strong>';
    tip.hidden=false;
    const x=dot.getAttribute('cx'),y=dot.getAttribute('cy');
    const above=dot.cy.baseVal.value>tip.offsetHeight+12;
    tip.style.left=x;
    tip.style.top=`calc(${y} ${above?'-':'+'} 9px)`;
    tip.style.translate=`-${x} ${above?'-100%':'0'}`;
    surface.setAttribute('aria-valuenow',p.match);
    surface.setAttribute('aria-valuetext',label+' · '+format(p.value,isRate)+detail+changeText);
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
    const correct=isRate?points.reduce((sum,p)=>sum+p.correct,0):0;
    const possible=isRate?points.reduce((sum,p)=>sum+p.possible,0):0;
    const value=isRate?100*correct/possible:points.at(-1)?.value;
    root.innerHTML=`<header class="rh-controls"><h2>Ranked match history</h2>
        <div class="rh-mode-controls">
          <select aria-label="Ranked mode">${Object.entries(modes).map(([key,name])=>`<option value="${key}" ${key===view.mode?'selected':''}>${name}</option>`).join('')}</select>
          ${switches('pool',{random:'Random',watched:'Watched'},'Song selection')}
        </div>
      </header>
      <div class="rh-measure">
        <div class="rh-summary"><small>${isRate?'Average guess rate':'Latest rating'}</small>
        <div><strong>${points.length?format(value,isRate):'—'}</strong><span>${rows.length} ${rows.length===1?'match':'matches'}${isRate&&possible?' · '+correct+' / '+possible+' correct':''}</span></div></div>
        ${switches('metric',{rating:'Rating',rate:'Guess Rate'},'Metric')}
      </div>
      ${points.length?`${plot(points,rows.length,isRate)}<div class="rh-legend"><span>Per match</span>${points.length>1?`<label><input type="checkbox" data-show-trend ${view.showTrend?'checked':''}>Show trend</label>`:''}</div>`:
      `<p class="rh-empty">${history==null?'Ranked history is currently unavailable.':rows.length?'No guess rate recorded for these matches.':'No completed ranked matches in this pool yet.'}</p>`}`;
    if(points.length)bindPlot(root,points,isRate);
  }
  root.onchange=e=>{
    if(e.target.matches('[data-show-trend]')){
      view.showTrend=e.target.checked;
      render();
      root.querySelector('[data-show-trend]').focus({preventScroll:true});
    }else if(e.target.matches('select')){
      view.mode=e.target.value;
      render();
      root.querySelector('select').focus();
    }
  };
  root.onclick=e=>{
    const button=e.target.closest('button[data-key]');
    if(!button)return;
    const {key,value}=button.dataset;
    view[key]=value;render();root.querySelector(`button[data-key="${key}"][data-value="${value}"]`).focus({preventScroll:true});
  };
  render();
}
