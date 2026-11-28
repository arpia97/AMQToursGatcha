export const weeklyRewards = [
  {credits:300}, {credits:300}, {credits:500,pack:'normal'}, {credits:500},
  {credits:700,pack:'premium'}, {credits:700}, {credits:1000,pack:'special'}
];
export const loginDay = now => new Date(now + 9 * 3600000).toISOString().slice(0,10);
export const weeklySignInStarts = Date.parse('2026-11-30T00:00:00+09:00');
export function streakReward(consecutive,donator){
  const day=(Math.max(1,consecutive)-1)%7+1, reward=weeklyRewards[day-1];
  return {day,consecutive,notes:donator?1:0,credits:reward.credits*(donator?2:1),pack:reward.pack||null,packs:reward.pack?(donator?2:1):0};
}
const packName = key => key[0].toUpperCase()+key.slice(1)+' pack';
const coinArt = `<svg aria-hidden="true" viewBox="0 0 64 56" class="streak-coins">
  <g fill="#ac7537" stroke="#efc078" stroke-width="1.8">
    <path d="M5 30v9c0 8 32 8 32 0v-9"/><ellipse cx="21" cy="30" rx="16" ry="6" fill="#e8b56a"/>
    <path d="M5 35c0 8 32 8 32 0" fill="none"/>
    <circle cx="39" cy="25" r="17" fill="#edc57f"/><circle cx="39" cy="25" r="13.3" fill="#c8914a" stroke="#ffe3a6"/>
  </g><path d="m39 15 2.5 7.2L49 25l-7.5 2.8L39 35l-2.5-7.2L29 25l7.5-2.8Z" fill="#fff0b5"/></svg>`;
export function streakPanel(reward,donator){
  const cards = weeklyRewards.map(({credits,pack},index)=>{
    const day=index+1, current=day===reward.day, past=day<reward.day;
    const art=pack?`<img alt="" src="/gacha/pack-art/character-${pack==='normal'?'standard':pack}.png">`:coinArt;
    return `<li class="streak-card${past?' collected':''}${day===7?' finale':''}" ${current?'aria-current="step"':''}>
      <div class="streak-day">Day ${day}${past?'<span aria-label="Collected" role="img">✓</span>':current?'<em>Today</em>':''}</div>
      <div class="streak-art">${art}</div><strong>${credits.toLocaleString('en-US')}</strong><small>credits</small>
      ${pack?`<b class="streak-pack">${packName(pack)}</b>`:''}</li>`;
  }).join('');
  const today=[reward.credits.toLocaleString('en-US')+' credits'];
  if(reward.pack)today.push((reward.packs>1?reward.packs+' × ':'')+packName(reward.pack));
  if(reward.notes)today.push('1 Note');
  const bonusIcon=donator?'<path d="m3 7 4 3 5-6 5 6 4-3-2 11H5Z"/>':'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>';
  return `<section class="weekly-streak" aria-label="Weekly login rewards">
    <header class="streak-head"><div class="streak-count">${reward.consecutive} consecutive ${reward.consecutive===1?'day':'days'}</div>
    <h2>Weekly Sign-In</h2><div class="streak-progress"><span>Day ${reward.day} of 7</span>
    <i aria-hidden="true">${weeklyRewards.map((_,i)=>`<s class="${i<reward.day?'filled':''}"></s>`).join('')}</i></div>
    <div class="streak-receipt"><span>Today’s reward</span><strong>${today.join(' · ')}</strong></div></header>
    <ol class="streak-cards">${cards}</ol>
    <div class="streak-extra" ${donator?'':'aria-disabled="true"'}><svg viewBox="0 0 24 24" aria-hidden="true">${bonusIcon}</svg>
    <div><strong>Donator bonus</strong><p>Double credits and packs, plus <span class="streak-note"><i aria-hidden="true">♫</i> 1 Note</span> each day.</p></div><b>${donator?'Active':'Locked'}</b></div>
    </section>`;
}

export async function checkLoginStreak(state,api){
  if(state.now<weeklySignInStarts || !state.me || document.hidden || state.me.daily===loginDay(state.now))return;
  const result=await api('login-check-in',{player:state.me.id});
  for(const key of ['daily','login_days','balance','earned'])state.me[key]=result[key];
  state.streakPacks=result.streakPacks;
  state.streakAward=result.reward;
}

// A tab left open overnight must use the new server day, even without navigation.
export function watchLoginDay(state,refresh){
  let timer;
  const schedule=()=>{
    clearTimeout(timer);
    const now=Date.now(), remaining=86400000-(now+9*3600000)%86400000;
    timer=setTimeout(()=>check().catch(()=>{}),remaining+1000);
  };
  async function check(){
    try {
      const current=state();
      if(!document.hidden && current?.me && loginDay(current.now)!==loginDay(Date.now()))await refresh();
    }finally{schedule();}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(()=>{});});
  schedule();
}
