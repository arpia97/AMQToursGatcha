// One page-lifetime controller. Float outside scrollable tables.
export function installDetailPopovers(root) {
  const win = root.defaultView;
  let active = null, tip = null, pinned = false, timer;
  function dismiss() {
    win.clearTimeout(timer);
    active?.setAttribute("aria-expanded", "false");
    active?.removeAttribute("aria-describedby");
    tip?.remove();
    active = tip = null;
    pinned = false;
  }
  function position() {
    if (!active) return;
    const rect = active.getBoundingClientRect();
    if (!active.isConnected || rect.bottom <= 0 || rect.top >= win.innerHeight) return dismiss();
    const bounds = active.closest(".table-wrap")?.getBoundingClientRect();
    if (bounds && (rect.right <= bounds.left || rect.left >= bounds.right || rect.bottom <= bounds.top || rect.top >= bounds.bottom)) return dismiss();
    const box = tip.getBoundingClientRect();
    tip.style.left = Math.max(6, Math.min(win.innerWidth - box.width - 6, rect.left + (rect.width - box.width) / 2)) + "px";
    const top = rect.top >= box.height + 8 ? rect.top - box.height - 4 : rect.bottom + 4;
    tip.style.top = Math.max(6, Math.min(win.innerHeight - box.height - 6, top)) + "px";
  }
  function show(button) {
    win.clearTimeout(timer);
    if (button === active) return;
    dismiss();
    active = button;
    tip = root.createElement("div");
    tip.id = "detail-popover";
    tip.className = "detail-popover";
    tip.setAttribute("role", "tooltip");
    tip.textContent = button.dataset.detailPopup;
    root.body.append(tip);
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-describedby", tip.id);
    position();
    tip.onpointerenter = () => win.clearTimeout(timer);
    tip.onpointerleave = hideSoon;
  }
  function hideSoon() {
    if (!pinned && root.activeElement !== active) {
      win.clearTimeout(timer);
      timer = win.setTimeout(dismiss, 120);
    }
  }
  root.addEventListener("pointerover", (event) => {
    const button = event.target.closest?.("[data-detail-popup]");
    if (button && event.pointerType !== "touch" && !pinned) show(button);
  });
  root.addEventListener("pointerout", (event) => { if (active?.contains(event.target)) hideSoon(); });
  root.addEventListener("focusin", (event) => { if (event.target.matches?.("[data-detail-popup]")) show(event.target); });
  root.addEventListener("focusout", (event) => { if (event.target === active) dismiss(); });
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-detail-popup]");
    if (!button) return;
    if (button === active && pinned) dismiss();
    else { show(button); pinned = true; }
  });
  root.addEventListener("pointerdown", (event) => { if (active && !active.contains(event.target) && !tip.contains(event.target)) dismiss(); });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) { dismiss(); event.stopImmediatePropagation(); }
  });
  root.addEventListener("scroll", position, true);
  win.addEventListener("resize", dismiss);
  return { dismiss };
}
