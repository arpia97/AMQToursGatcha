import { RARITIES } from "./card-values.js";
import { cardSurface } from "./card-surface.js";
export const CARD_ORDER_PAGE_SIZE = 24;
export function createShowcaseEditor(helpers, { mode = "showcase" } = {}) {
  const { escape: e, cardBy } = helpers;
  let owner,
    original = [],
    order = [],
    items = new Map(),
    sort = "custom",
    kind = "both",
    rarity = "",
    role = "",
    active = false,
    page = 1;
  function visibleOrder() {
    if (mode !== "collection" || (kind === "both" && !rarity && !role))
      return order;
    return order.filter((id) => {
      const c = cardBy(id);
      return (
        c &&
        (kind === "both" || c.kind === kind) &&
        (!rarity || (c.rarity || "Pending") === rarity) &&
        (kind !== "character" || !role || c.role === role)
      );
    });
  }
  const pages = () =>
    Math.max(1, Math.ceil(visibleOrder().length / CARD_ORDER_PAGE_SIZE));
  function open(profile, player, initialPage = 1) {
    if (!player || profile?.id !== player)
      throw Error("You can arrange only your own " + mode + ".");
    owner = player;
    const rows =
      mode === "collection"
        ? profile.collection || profile.inventory || []
        : profile.showcase || [];
    original = rows.map((i) => i.card);
    order = [...original];
    items = new Map(
      rows.map((i) => [
        i.card,
        { ...i, wishlisted: (profile.wishlist || []).includes(i.card) },
      ]),
    );
    sort = "custom";
    kind = "both";
    rarity = "";
    role = "";
    active = true;
    page = Math.max(1, Math.min(pages(), initialPage));
  }
  function move(card, position, follow = false) {
    const index = order.indexOf(card);
    if (
      index < 0 ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= order.length
    )
      return false;
    order.splice(index, 1);
    order.splice(position, 0, card);
    sort = "custom";
    if (follow) {
      const visIdx = visibleOrder().indexOf(card);
      page =
        Math.floor((visIdx >= 0 ? visIdx : position) / CARD_ORDER_PAGE_SIZE) +
        1;
    }
    return true;
  }
  function compareCards(a, b) {
    const first = cardBy(a),
      second = cardBy(b);
    return (
      (sort === "rarity"
        ? RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
        : sort === "level"
          ? (items.get(b)?.level || 1) - (items.get(a)?.level || 1)
          : sort === "copies"
            ? (items.get(b)?.copies || 1) - (items.get(a)?.copies || 1)
            : sort === "collected"
              ? (items.get(b)?.acquired_at || 0) -
                (items.get(a)?.acquired_at || 0)
              : 0) ||
      first.name.localeCompare(second.name, "en", {
        numeric: true,
        sensitivity: "base",
      })
    );
  }
  function sortBy(value) {
    const allowed = [
      "custom",
      "original",
      "rarity",
      "name",
      "level",
      ...(mode === "collection" ? ["copies", "collected"] : []),
    ];
    if (!allowed.includes(value)) return;
    sort = value;
    if (sort === "original") order = [...original];
    else if (sort !== "custom") {
      const visible = visibleOrder();
      if (visible.length === order.length) order.sort(compareCards);
      else {
        const subset = [...visible].sort(compareCards),
          set = new Set(visible);
        let idx = 0;
        order = order.map((id) => (set.has(id) ? subset[idx++] : id));
      }
    }
  }
  function setFilter(field, value) {
    if (mode !== "collection") return;
    if (
      field === "kind" &&
      ["character", "seiyuu", "both"].includes(value)
    ) {
      kind = value;
      if (kind !== "character") role = "";
    }
    if (field === "rarity") rarity = String(value || "");
    if (field === "role") role = kind === "character" ? String(value || "") : "";
    page = 1;
  }
  function clearFilters() {
    kind = "both";
    rarity = "";
    role = "";
    page = 1;
  }
  function payload(player) {
    if (!player || player !== owner)
      throw Error("Sign in to the same account before saving.");
    return { cards: [...order], expectedCards: [...original] };
  }
  function render() {
    const title =
        mode === "showcase"
          ? "Showcase"
          : mode === "collection"
            ? "Collection"
            : "Wishlist",
      changed = order.some((id, i) => id !== original[i]),
      visible = visibleOrder(),
      offset = (page - 1) * CARD_ORDER_PAGE_SIZE;
    const pager = () =>
      '<div class="toolbar wishlist-arrange-pager"><button type="button" class="button secondary" data-action="' +
      mode +
      '-page" data-page="' +
      (page - 1) +
      '" ' +
      (page <= 1 ? "disabled" : "") +
      ' title="Drop a card here to move it to the previous page">← Previous</button><span>Page ' +
      page +
      " of " +
      pages() +
      '</span><button type="button" class="button secondary" data-action="' +
      mode +
      '-page" data-page="' +
      (page + 1) +
      '" ' +
      (page >= pages() ? "disabled" : "") +
      ' title="Drop a card here to move it to the next page">Next →</button></div>';
    const sorts = [
      ["custom", "Custom Order"],
      ["rarity", "Rarity · Highest First"],
      ["name", "Name · A–Z"],
      ...(mode === "showcase" || mode === "collection"
        ? [["level", "Enhancement · Highest First"]]
        : []),
      ...(mode === "collection"
        ? [
            ["copies", "Most Copies"],
            ["collected", "Collection Date · Newest"],
          ]
        : []),
      ["original", "Restore Saved Order"],
    ];
    const filterControls =
      mode === "collection"
        ? '<div class="collection-arrange-filters"><div class="tabs profile-collection-tabs" role="group" aria-label="Collection Card Type">' +
          [
            ["character", "Characters"],
            ["seiyuu", "Seiyuus"],
            ["both", "Both"],
          ]
            .map(
              ([id, label]) =>
                '<button type="button" class="tab ' +
                (kind === id ? "active" : "") +
                '" data-action="collection-arrange-kind" data-kind="' +
                id +
                '" aria-pressed="' +
                (kind === id) +
                '">' +
                label +
                "</button>",
            )
            .join("") +
          '</div><div class="catalog-refinements"><label>Rarity<select id="collection-arrange-rarity"><option value="">All Rarities</option>' +
          [...RARITIES, "Pending"]
            .map(
              (r) =>
                '<option value="' +
                r +
                '" ' +
                (rarity === r ? "selected" : "") +
                ">" +
                r +
                "</option>",
            )
            .join("") +
          "</select></label>" +
          (kind === "character"
            ? '<label>Character Role<select id="collection-arrange-role"><option value="">All Roles</option><option value="main" ' +
              (role === "main" ? "selected" : "") +
              '>Main</option><option value="supporting" ' +
              (role === "supporting" ? "selected" : "") +
              ">Supporting</option></select></label>"
            : "") +
          (kind !== "both" || rarity || role
            ? '<button type="button" class="text-button" data-action="clear-collection-arrange-filters">Clear Filters</button>'
            : "") +
          "</div></div>"
        : "";
    return (
      '<section class="profile-card-panel ' +
      mode +
      '-arrange-panel"><form id="' +
      mode +
      '-order-form"><div class="section-head"><h2>' +
      title +
      '</h2><div class="wishlist-arrange-actions"><button type="button" class="button secondary" data-action="' +
      mode +
      '-cancel">Cancel</button><button type="submit" class="button mint" ' +
      (!changed ? "disabled" : "") +
      '>Save</button></div></div><p class="form-hint" id="' +
      mode +
      '-drag-help">Drag cards into place. Drop on Previous or Next to move between pages. Use arrow keys on a handle, or set a position directly.</p>' +
      filterControls +
      '<label class="wishlist-inline-sort">Sort By<select id="' +
      mode +
      '-sort">' +
      sorts
        .map(
          ([value, label]) =>
            '<option value="' +
            value +
            '" ' +
            (sort === value ? "selected" : "") +
            ">" +
            label +
            "</option>",
        )
        .join("") +
      '</select></label><div class="form-error" role="alert"></div>' +
      pager() +
      (visible.length
        ? '<div class="card-grid wishlist-sort-grid ' +
          mode +
          '-sort-grid" role="list" aria-label="Arrange ' +
          title +
          '">' +
          visible
            .slice(offset, offset + CARD_ORDER_PAGE_SIZE)
            .map((id) => {
              const c = cardBy(id),
                item = items.get(id) || {},
                pos = order.indexOf(id) + 1;
              return (
                '<div class="wishlist-sort-card ' +
                mode +
                '-sort-card" data-' +
                mode +
                '-sort-card="' +
                e(id) +
                '" draggable="true" role="listitem"><div class="wishlist-sort-tools"><button type="button" class="wishlist-drag-handle" draggable="true" data-' +
                mode +
                '-handle="' +
                e(id) +
                '" aria-label="Move ' +
                e(c.name) +
                '" aria-describedby="' +
                mode +
                '-drag-help">⠿</button><label><span class="sr-only">Position for ' +
                e(c.name) +
                '</span><span aria-hidden="true">#</span><input type="number" data-' +
                mode +
                '-rank="' +
                e(id) +
                '" min="1" max="' +
                order.length +
                '" value="' +
                pos +
                '" aria-label="Position for ' +
                e(c.name) +
                '"></label></div>' +
                cardSurface(
                  c,
                  {
                    level: item.level || 1,
                    showLevel: mode === "showcase" || mode === "collection",
                    protectedCard: !!item.protected,
                    wishlisted: !!item.wishlisted,
                  },
                  helpers,
                ) +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : '<p class="notice">No matching cards in your collection.</p>') +
      pager() +
      '</form><span id="' +
      mode +
      '-arrange-status" class="card-order-status" role="status"></span></section>'
    );
  }
  return {
    open,
    move,
    sortBy,
    setFilter,
    clearFilters,
    payload,
    render,
    activeFor: (player) => active && owner === player,
    close: () => (active = false),
    cards: () => [...order],
    currentPage: () => page,
    setPage: (next) => {
      if (Number.isInteger(next) && next >= 1 && next <= pages()) page = next;
    },
    drop: (card, target, after = false) => {
      const ids = order.filter((id) => id !== card),
        index = ids.indexOf(target);
      return index >= 0 && move(card, index + (after ? 1 : 0));
    },
  };
}
