import { searchTerms } from "./search.js";
const indexes=new WeakMap(), rendered=new WeakMap();
const CREDIT_PLAYER_LIMIT=100;
function creditIndex(state){
  const sources=[state.players,state.aliases,state.usernames],lengths=sources.map(rows=>rows?.length||0);
  let cached=indexes.get(state);
  if(cached && cached.sources.every((rows,i)=>rows===sources[i] && cached.lengths[i]===lengths[i]))return cached.rows;
  const names=new Map();
  for(const rows of [state.aliases||[],state.usernames||[]])for(const row of rows){
    if(!names.has(row.player))names.set(row.player,[]);
    names.get(row.player).push(row.alias||row.label||"");
  }
  const rows=state.players.map(player=>({player,values:[player.id,player.name,...(player.aliases||[]),...(names.get(player.id)||[])].map(value=>String(value).toLowerCase())}));
  indexes.set(state,{sources,lengths,rows});return rows;
}
export function matchingCreditPlayers(state, query = "") {
  const terms=searchTerms(query);
  return creditIndex(state).filter(row=>row.values.some(value=>terms.every(term=>value.includes(term)))).map(row=>row.player);
}
function visibleCreditPlayers(matches,selected=""){
  const visible=matches.slice(0,CREDIT_PLAYER_LIMIT),chosen=matches.find(p=>p.id===selected);
  if(chosen && !visible.includes(chosen))visible[visible.length-1]=chosen;
  return visible;
}
const creditCount=(count,shown)=>count>shown?`${shown} of ${count} players shown · Keep typing to narrow the list.`:`${count} matching ${count===1?'player':'players'}`;
export function updateCreditPlayerSearch(state,input,escape){
  const form=input.form,select=form?.querySelector('[name="player"]');
  if(!select)return;
  const matches=matchingCreditPlayers(state,input.value),visible=visibleCreditPlayers(matches,select.value);
  const key=JSON.stringify([visible.map(p=>p.id),select.value]);
  const previous=rendered.get(select);
  if(!previous || previous.state!==state || previous.key!==key){
    const selected=select.value;
    select.innerHTML=creditPlayerOptions(visible,escape,selected);
    rendered.set(select,{state,key:JSON.stringify([visible.map(p=>p.id),select.value])});
  }
  form.querySelector('[data-credit-count]').textContent=creditCount(matches.length,visible.length);
  const empty=!!input.value.trim() && !matches.length;
  input.classList.toggle('no-results',empty);input.setAttribute('aria-invalid',String(empty));
}
export const creditPlayerOptions = (players, escape, selected = "") =>
  '<option value="">Choose a Player</option>' +
  players
    .map(
      (p) =>
        `<option value="${escape(p.id)}" ${selected === p.id ? "selected" : ""}>${escape(p.name)} (${escape(p.id)}) · ${Number(p.balance).toLocaleString("en-US")} credits</option>`,
    )
    .join("");
export function creditPlayerPicker(state, id, escape) {
  return `<div class="form-grid host-credit-picker"><label>Find a Player<input type="search" data-credit-search="${id}" aria-label="Search Players to ${id === "grant" ? "Reward" : "Deduct Credits"}" placeholder="Username, alias or Tours ID" autocomplete="off"></label><label>AMQ Player<select name="player" id="${id}-player" required>${creditPlayerOptions(visibleCreditPlayers(state.players), escape)}</select></label></div><p class="form-hint" data-credit-count="${id}">${creditCount(state.players.length,Math.min(state.players.length,CREDIT_PLAYER_LIMIT))} · Search includes aliases and past usernames.</p>`;
}
export function deductionPanel(state, escape) {
  return `<section class="host-panel"><h2>Deduct Credits</h2><p>Remove available credits from a player. Lifetime earned credits and tour statistics stay unchanged. Every deduction is recorded in the ledger.</p><form id="deduct" class="stack">${creditPlayerPicker(state, "deduct", escape)}<div class="form-grid"><label>Credit Amount<input type="number" name="amount" min="1" max="1000000" step="1" required></label><label>Reason<input name="note" maxlength="240" placeholder="Host credit deduction"></label></div><button class="button secondary" type="submit">Review Deduction →</button></form><div id="deduction-review"></div></section>`;
}
export function deductionReview(quote, escape) {
  return `<section class="notice space-top"><h3>Review Credit Deduction</h3><p><strong>${escape(quote.name)}</strong> · AMQ Tours ID ${escape(quote.player)}<br>Remove <strong>${quote.amount.toLocaleString("en-US")}</strong> credits · Balance ${quote.expectedBalance.toLocaleString("en-US")} → <strong>${quote.remaining.toLocaleString("en-US")}</strong><br>Reason: ${escape(quote.note)}</p><form id="deduct-confirm" class="stack"><div class="form-grid"><button type="button" class="button secondary" data-cancel-deduction>Cancel</button><button type="submit" class="button">Confirm Deduction</button></div></form></section>`;
}
