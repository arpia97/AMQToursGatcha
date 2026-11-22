const detailTrigger = "[data-detail-popup],[data-song-progress]";

export function songProgressTrigger(scope, index, details, escape) {
  const song = "Song " + (index + 1);
  return '<button type="button" class="song-progress-trigger" data-song-progress-key="' +
    escape(scope + ":" + index) + '" data-song-progress="' + escape(JSON.stringify({ song, ...details })) + '" aria-label="' +
    escape(song + ", " + details.result + ", show details") + '" aria-expanded="false"></button>';
}

function fillSongPopover(tip, details) {
  tip.classList.add("song-progress-popover");
  tip.dataset.result = details.correct ? "correct" : "incorrect";
  tip.innerHTML = '<div class="song-progress-content"><header class="song-progress-head"><span></span><strong></strong></header>' +
    '<div class="song-progress-track"><strong></strong><span></span><span></span></div>' +
    '<div class="song-progress-answer"><span>Your Answer</span><strong></strong></div></div>';
  const [number, result, title, artist, anime, answer] = tip.querySelectorAll(
    ".song-progress-head > *, .song-progress-track > *, .song-progress-answer > strong",
  );
  number.textContent = details.song;
  result.textContent = (details.correct ? "✓ " : "× ") + details.result;
  title.textContent = details.title || "Unknown Song";
  artist.textContent = details.artist || "";
  artist.hidden = !details.artist;
  anime.textContent = details.anime || "";
  anime.hidden = !details.anime;
  answer.textContent = details.answer?.trim() ? details.answer : "No Answer";
}

// One page-lifetime controller. Float outside scrollable tables and game panels.
export function installDetailPopovers(root) {
  const win = root.defaultView;
  let active = null, tip = null, pinned = false, timer;
  const detach = new win.MutationObserver(() => {
    if (active && !active.isConnected) position();
  });
  function dismiss() {
    detach.disconnect();
    win.clearTimeout(timer);
    active?.setAttribute("aria-expanded", "false");
    active?.removeAttribute("aria-describedby");
    tip?.remove();
    active = tip = null;
    pinned = false;
  }
  function position() {
    if (!active) return;
    if (!active.isConnected) {
      const key = active.dataset.songProgressKey;
      const replacement = key && root.querySelector('[data-song-progress-key="' + win.CSS.escape(key) + '"]');
      if (!replacement) return dismiss();
      active = replacement;
      active.setAttribute("aria-expanded", "true");
      active.setAttribute("aria-describedby", tip.id);
      fillSongPopover(tip, JSON.parse(active.dataset.songProgress));
    }
    const rect = active.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= win.innerHeight) return dismiss();
    const bounds = active.closest(".table-wrap, .sa-song-list-body")?.getBoundingClientRect();
    if (bounds && (rect.right <= bounds.left || rect.left >= bounds.right || rect.bottom <= bounds.top || rect.top >= bounds.bottom)) return dismiss();
    const box = tip.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const left = Math.max(6, Math.min(win.innerWidth - box.width - 6, center - box.width / 2));
    tip.style.left = left + "px";
    if (active.hasAttribute("data-song-progress")) {
      tip.style.top = (rect.bottom + win.scrollY + 9) + "px";
      tip.style.setProperty("--song-progress-anchor", Math.max(12, Math.min(box.width - 12, center - left)) + "px");
      return;
    }
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
    if (button.dataset.songProgress) fillSongPopover(tip, JSON.parse(button.dataset.songProgress));
    else tip.textContent = button.dataset.detailPopup;
    const container = button.closest("dialog[open]") || root.body;
    container.append(tip);
    detach.observe(root.body, { childList: true, subtree: true });
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
    const button = event.target.closest?.(detailTrigger);
    if (button && event.pointerType !== "touch" && !pinned) show(button);
  });
  root.addEventListener("pointerout", (event) => { if (active?.contains(event.target)) hideSoon(); });
  root.addEventListener("focusin", (event) => { if (event.target.matches?.(detailTrigger)) show(event.target); });
  root.addEventListener("focusout", (event) => { if (event.target === active && active.isConnected) dismiss(); });
  root.addEventListener("click", (event) => {
    const button = event.target.closest?.(detailTrigger);
    if (!button) return;
    if (button === active && pinned) dismiss();
    else {
      show(button);
      pinned = true;
      if (button.dataset.songProgress && tip.getBoundingClientRect().bottom > win.innerHeight - 72) {
        button.scrollIntoView({ block: "center" });
        position();
      }
    }
  });
  root.addEventListener("pointerdown", (event) => { if (active && !active.contains(event.target) && !tip.contains(event.target)) dismiss(); });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) { dismiss(); event.preventDefault(); event.stopImmediatePropagation(); }
  });
  root.addEventListener("scroll", position, true);
  win.addEventListener("resize", () => {
    if (active?.dataset.songProgress) position();
    else dismiss();
  });
  return { dismiss };
}
