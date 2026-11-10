import { animeProgressComparator } from "./card-display.js";

export function createPinnedAnimeEditor({
  series: seriesName = (c) => c?.series_romaji || c?.series || "",
  escape: e = String,
} = {}) {
  let owner = null,
    original = [],
    order = [],
    animeMap = new Map(),
    active = false;

  function open(pinnedList, player) {
    if (!player) return;
    owner = player;
    active = true;
    const list = Array.isArray(pinnedList) ? pinnedList : [];
    original = list.map((a) => a.series_key);
    order = [...original];
    animeMap = new Map(list.map((a) => [a.series_key, { ...a }]));
  }

  function move(key, position) {
    const from = order.indexOf(key);
    if (
      from < 0 ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= order.length
    )
      return false;
    order.splice(from, 1);
    order.splice(position, 0, key);
    return true;
  }

  function drop(key, target, after = false) {
    const remaining = order.filter((k) => k !== key),
      at = remaining.indexOf(target);
    return at >= 0 && move(key, at + (after ? 1 : 0));
  }

  function reset() {
    order = [...original];
  }

  function sortBy(criterion) {
    if (criterion === "progress") {
      order.sort((a, b) => {
        const itemA = animeMap.get(a),
          itemB = animeMap.get(b);
        return animeProgressComparator(itemA, itemB);
      });
    }
  }

  function render(numberFormatter = String) {
    if (!active || !order.length) return "";
    const pins = order.map((k) => animeMap.get(k)).filter(Boolean);
    const isDirty = order.some((k, i) => k !== original[i]);
    return (
      '<section class="pinned-anime pinned-anime-arrange-panel">' +
      '<div class="section-head">' +
      '<div><span class="eyebrow">THE STORIES THAT STAY</span><h2>Your Pinned Anime</h2></div>' +
      '<div class="wishlist-arrange-actions">' +
      `<span class="pill">${pins.length} / 20</span>` +
      `<button type="button" class="button mint" data-action="pinned-anime-save" ${!isDirty ? "disabled" : ""}>Save Pinned Order</button>` +
      `<button type="button" class="button secondary" data-action="pinned-anime-reset" ${!isDirty ? "disabled" : ""}>Reset</button>` +
      "</div>" +
      "</div>" +
      '<p class="form-hint" id="pinned-anime-drag-help">Drag pinned anime cards into place, use arrow keys on a handle, or enter a position number.</p>' +
      '<div class="anime-progress-grid pinned-anime-sort-grid" role="list" aria-label="Arrange Pinned Anime">' +
      pins
        .map((c, i) => {
          const title = seriesName({ ...c, series: c.series_romaji });
          const owned = c.owned || 0;
          const pos = i + 1;
          const isComplete = owned === c.total;
          return (
            `<article class="anime-progress-card wishlist-sort-card pinned-anime-sort-card ${isComplete ? "complete" : ""}" role="listitem" draggable="true" data-pinned-anime-sort-card="${e(c.series_key)}">` +
            '<div class="wishlist-sort-tools">' +
            `<button type="button" class="wishlist-drag-handle" draggable="true" data-pinned-anime-handle="${e(c.series_key)}" aria-label="Move ${e(title)}" aria-describedby="pinned-anime-drag-help">⠿</button>` +
            `<label><span class="sr-only">Position for ${e(title)}</span><span aria-hidden="true">#</span><input type="number" data-pinned-anime-rank="${e(c.series_key)}" min="1" max="${pins.length}" value="${pos}" aria-label="Position for ${e(title)}"></label>` +
            "</div>" +
            `<span class="eyebrow">${isComplete ? "COLLECTION COMPLETE" : "★ PINNED ANIME"}</span>` +
            `<h3>${e(title)}</h3>` +
            '<div class="completion-label">' +
            `<strong>${numberFormatter(owned)} / ${numberFormatter(c.total)} characters</strong>` +
            `<span>${Math.round((owned * 100) / (c.total || 1))}%</span>` +
            "</div>" +
            `<progress aria-label="${e(title)} completion" value="${owned}" max="${Math.max(1, c.total || 1)}"></progress>` +
            "</article>"
          );
        })
        .join("") +
      "</div>" +
      '<span id="pinned-anime-arrange-status" class="card-order-status" role="status"></span>' +
      "</section>"
    );
  }

  return {
    open,
    move,
    drop,
    reset,
    sortBy,
    render,
    activeFor: (player) => active && owner === player,
    close: () => {
      active = false;
      owner = null;
    },
    dirty: () => order.some((k, i) => k !== original[i]),
    items: () => order.map((k) => animeMap.get(k)).filter(Boolean),
    keys: () => [...order],
    payload: (player) => {
      if (player !== owner)
        throw Error("Sign in to the same account before saving.");
      return {
        order: [...order],
        expectedOrder: [...original],
      };
    },
  };
}
