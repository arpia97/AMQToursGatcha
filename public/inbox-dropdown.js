import { inboxBulkControl } from "./inbox-ui.js";

export function installInboxDropdown({anchor, href, player, load, rememberCards, inbox, onCount}) {
  const bell = anchor.querySelector(".inbox-bell");
  const panel = anchor.querySelector(".inbox-pop");
  const list = panel.querySelector(".inbox-pop-list");
  const bulkButton = panel.querySelector('[data-action="inbox-read"]');
  const desktop = matchMedia("(min-width: 851px)");
  let owner, generation = 0, items = [], latest;
  bell.href = panel.querySelector(".inbox-all").href = href;

  function syncBulk(unread) {
    const {action,label,id} = inboxBulkControl(unread, latest);
    bulkButton.dataset.action = "inbox-" + action;
    bulkButton.dataset.id = String(id);
    bulkButton.textContent = label;
    bulkButton.disabled = !id;
  }

  function close(focus = false) {
    generation++;
    panel.hidden = true;
    items = [];
    list.replaceChildren();
    if (desktop.matches) bell.setAttribute("aria-expanded", "false");
    if (focus) bell.focus();
  }
  function sync() {
    const id = player();
    if (owner !== id || !desktop.matches) close();
    owner = id;
    anchor.hidden = !id;
    if (desktop.matches) {
      bell.setAttribute("role", "button");
      bell.setAttribute("aria-controls", panel.id);
      bell.setAttribute("aria-expanded", String(!panel.hidden));
    } else {
      for (const key of ["role", "aria-controls", "aria-expanded"]) bell.removeAttribute(key);
    }
  }
  async function open() {
    const version = ++generation, id = owner;
    panel.hidden = false;
    bell.setAttribute("aria-expanded", "true");
    bulkButton.disabled = true;
    list.textContent = "Loading notifications…";
    try {
      const feed = await load();
      if (generation !== version || player() !== id || feed.player !== id) return;
      rememberCards(feed.cards);
      latest = feed.latest;
      syncBulk(feed.unread);
      onCount(feed.unread);
      items = feed.items.slice(0, 6);
      if (items.length) list.innerHTML = items.map(row => inbox.rowButton(row, "peek")).join("");
      else list.textContent = "No notifications yet.";
    } catch {
      if (generation === version) list.innerHTML = 'Couldn’t load notifications. <button class="text-button" type="button" data-inbox-retry>Retry</button>';
    }
  }
  bell.addEventListener("click", event => {
    if (!desktop.matches || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (panel.hidden) open(); else close();
  });
  bell.addEventListener("keydown", event => {
    if (desktop.matches && event.key === " ") { event.preventDefault(); bell.click(); }
  });
  panel.addEventListener("click", event => {
    if (event.target.closest("[data-inbox-retry]")) open();
    if (event.target.closest(".inbox-all")) close();
  });
  document.addEventListener("pointerdown", event => {
    if (!panel.hidden && !anchor.contains(event.target)) close();
  });
  document.addEventListener("focusin", event => {
    if (!panel.hidden && !anchor.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (!panel.hidden && event.key === "Escape") { event.preventDefault(); close(true); }
  });
  desktop.addEventListener("change", sync);
  window.addEventListener("popstate", () => close());
  window.addEventListener("hashchange", () => close());
  function markRead(id, all, remaining) {
    if (panel.hidden) return;
    if (all && remaining) { open(); return; }
    for (const row of items) {
      if (all ? row.id > id : row.id !== id) continue;
      row.inbox_read = 1;
      const button = list.querySelector('[data-action="inbox-peek"][data-id="' + row.id + '"]');
      if (!button) continue;
      button.dataset.unread = "false";
      button.querySelector(".inbox-dot").setAttribute("aria-label", "Read");
      const check = button.nextElementSibling, focused = document.activeElement === check;
      check.outerHTML = inbox.rowControl(row);
      if (focused) button.nextElementSibling.focus({preventScroll:true});
    }
    syncBulk(remaining);
  }
  return {sync, close, markRead, refresh: () => { if (!panel.hidden) return open(); }, detail: id => inbox.detail(id, items)};
}
