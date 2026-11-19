import { installInboxDropdown } from "./inbox-dropdown.js";
import { createInbox } from "./inbox-ui.js";
import { recentActivityRows } from "./account-activity.js";
import { friendsPanel } from "./friends-ui.js";
import { titleBadges } from "./title-ui.js";

export function installPlayAccountMenu({ $, api, modal, escape, number, avatarHTML, gachaHref, state }) {
  const menu = $("#account-menu"), trigger = $(".play-profile-button"), anchor = trigger.parentElement;
  const bell = $(".inbox-bell"), badge = bell.querySelector("b"), wallet = $(".play-credits");
  const cards = new Map();
  let friendView = "added", friendPage = 1, writes = Promise.resolve();
  const player = () => state().me?.id;
  let countVersion = 0, checking = false;
  function count(value) {
    countVersion++;
    badge.hidden = !value;
    badge.textContent = value ? number(value) : "";
    bell.setAttribute("aria-label", value ? "Notifications, " + number(value) + " unread" : "Notifications");
    state().inboxUnread = value;
  }
  async function refreshCount() {
    const owner = player(), version = countVersion;
    if (!owner || document.hidden || checking) return;
    checking = true;
    try {
      const result = await api("notices");
      if (player() === owner && countVersion === version) count(result.inboxUnread);
    } catch { /* The next refresh retries. */ }
    finally { checking = false; }
  }
  document.addEventListener("visibilitychange", refreshCount);
  window.setInterval(refreshCount, 60000);
  const inbox = createInbox({ escape, cardBy: id => cards.get(id) || {}, routeHref: gachaHref });
  const dropdown = installInboxDropdown({
    anchor: $(".inbox-anchor"), href: gachaHref("notifications"), player, inbox,
    load: () => api("inbox"), onCount: count,
    rememberCards(rows) { cards.clear(); for (const card of rows || []) cards.set(card.id,card); },
  });
  function close(focus = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus();
  }
  function toggle() {
    if (!menu.hidden) { close(true); return; }
    dropdown.close();
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }
  for (const event of ["focusin","pointerdown"]) document.addEventListener(event, e => {
    if (!anchor.contains(e.target)) close();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { e.preventDefault(); close(true); } });
  window.addEventListener("popstate", () => close());
  function sync() {
    const me = state().me;
    anchor.hidden = wallet.hidden = !me;
    $("#play-signin").hidden = !!me;
    dropdown.sync();
    count(state().inboxUnread || 0);
    if (!me) { close(); return; }
    trigger.innerHTML = state().avatar ? avatarHTML() : escape(me.name.slice(0, 2).toUpperCase());
    wallet.querySelector("strong").textContent = number(me.balance);
  }
  async function showPanel(path, render) {
    const owner = player();
    modal('<p class="loading">Loading…</p>');
    const pending = $("#modal-body").firstElementChild;
    try {
      const data = await api(path);
      if (pending.isConnected && $("#modal").open && player() === owner) modal(render(data));
    } catch (error) {
      if (pending.isConnected) pending.textContent = error.message;
    }
  }
  function activity(data) {
    const me = data.me, rows = recentActivityRows(data);
    return '<section class="account-popup"><header class="account-summary"><h2>'+escape(me.name)+'</h2>'+titleBadges({role:me.role,titles:[]},escape)+'<p>AMQ player ID · '+escape(me.id)+'</p><div class="two-col"><div class="stat"><span>Available</span><strong>'+number(me.balance)+'</strong></div><div class="stat"><span>Lifetime Earned</span><strong>'+number(me.earned)+'</strong></div></div></header><div class="section-head"><h3>Recent Activity</h3></div><div class="account-activity" tabindex="0">'+(rows.length ? '<div class="table-wrap"><table><tbody>'+rows.map(row=>'<tr><td>'+escape(row.text)+'<br><small>'+escape(new Date(row.at).toLocaleDateString())+'</small></td><td class="'+(row.delta>0?'ledger-positive':row.delta<0?'ledger-negative':'muted')+'">'+(row.delta>0?'+':'')+number(row.delta)+'</td></tr>').join("")+'</tbody></table></div>' : '<p>No wallet or trade activity yet.</p>')+'</div></section>';
  }
  function showFriends() {
    return showPanel("friends?view=" + friendView + "&page=" + friendPage, data => {
      const portraits = new Map((data.cards || []).map(c => [c.id, c]));
      return friendsPanel(data,{escape,viewer:player(),profileURL:id=>gachaHref("player/"+encodeURIComponent(id)),
        avatarHTML:p=>avatarHTML(p, portraits.has(p.avatar_card) ? {...portraits.get(p.avatar_card),level:p.avatar_level||1} : null)});
    });
  }
  async function action(name, button) {
    if (name === "account-activity" || name === "activity") await showPanel("state?view=compact", activity);
    else if (name === "friends-open") {
      friendView = button.dataset.view || "added";
      friendPage = Number(button.dataset.page || 1);
      await showFriends();
    } else if (name === "friend-set") {
      button.disabled = true;
      try {
        await api("friend-set", {player:button.dataset.player, added:button.dataset.added==="true"});
        if (button.isConnected && $("#modal").open) await showFriends();
      } finally { button.disabled = false; }
    } else if (["inbox-peek","inbox-read","inbox-check"].includes(name)) {
      const owner = player(), id = Number(button.dataset.id), all = name === "inbox-read";
      const html = name === "inbox-peek" && dropdown.detail(id);
      const write = writes.then(() => player()===owner && api("inbox-read",{id,all}));
      writes = write.catch(()=>{});
      const data = await write;
      if (data && player()===owner) {
        count(data.unread); dropdown.markRead(id,all,data.unread);
        if (html && button.isConnected) { dropdown.close(true); modal(html); }
      }
    } else return false;
    return true;
  }
  return {sync, toggle, close, action};
}
