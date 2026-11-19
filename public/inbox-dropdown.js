export function installInboxDropdown({anchor, href, player, load, rememberCards, inbox}) {
  const bell = anchor.querySelector(".inbox-bell");
  const panel = anchor.querySelector(".inbox-pop");
  const list = panel.querySelector(".inbox-pop-list");
  const desktop = matchMedia("(min-width: 851px)");
  let owner, generation = 0, items = [];
  bell.href = panel.querySelector(".inbox-all").href = href;

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
    list.textContent = "Loading notifications…";
    try {
      const feed = await load();
      if (generation !== version || player() !== id || feed.player !== id) return;
      rememberCards(feed.cards);
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
  return {sync, close, detail: id => inbox.detail(id, items)};
}
