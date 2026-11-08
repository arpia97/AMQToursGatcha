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
    active = false,
    page = 1;
  const pages = () =>
    Math.max(1, Math.ceil(order.length / CARD_ORDER_PAGE_SIZE));
  function open(profile, player, initialPage = 1) {
    if (!player || profile?.id !== player)
      throw Error("You can arrange only your own showcase.");
    owner = player;
    original = (profile.showcase || []).map((i) => i.card);
    order = [...original];
    items = new Map(
      (profile.showcase || []).map((i) => [
        i.card,
        { ...i, wishlisted: (profile.wishlist || []).includes(i.card) },
      ]),
    );
    sort = "custom";
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
    if (follow) page = Math.floor(position / CARD_ORDER_PAGE_SIZE) + 1;
    return true;
  }
  function sortBy(value) {
    if (!["custom", "original", "rarity", "name", "level"].includes(value))
      return;
    sort = value;
    if (sort === "original") order = [...original];
    else if (sort !== "custom")
      order.sort((a, b) => {
        const first = cardBy(a),
          second = cardBy(b);
        return (
          (sort === "rarity"
            ? RARITIES.indexOf(second.rarity) - RARITIES.indexOf(first.rarity)
            : sort === "level"
              ? (items.get(b)?.level || 1) - (items.get(a)?.level || 1)
              : 0) ||
          first.name.localeCompare(second.name, "en", {
            numeric: true,
            sensitivity: "base",
          })
        );
      });
  }
  function payload(player) {
    if (!player || player !== owner)
      throw Error("Sign in to the same account before saving.");
    return { cards: [...order], expectedCards: [...original] };
  }
  function render() {
    const title = mode === "showcase" ? "Showcase" : "Wishlist",
      changed = order.some((id, i) => id !== original[i]),
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
      ...(mode === "showcase"
        ? [["level", "Enhancement · Highest First"]]
        : []),
      ["original", "Restore Saved Order"],
    ];
    return (
      '<section class="profile-card-panel ' +
      mode +
      '-arrange-panel"><form id="' +
      mode +
      '-order-form"><div class="section-head"><h2>' +
      title +
      '</h2><div class="wishlist-arrange-actions"><button type="button" class="button mint" data-action="' +
      mode +
      '-arrange" aria-pressed="true">Arrange ' +
      title +
      '</button><button type="button" class="button secondary" data-action="' +
      mode +
      '-cancel">Cancel</button><button type="submit" class="button mint" ' +
      (!changed ? "disabled" : "") +
      '>Save Order</button></div></div><p class="form-hint" id="' +
      mode +
      '-drag-help">Drag cards into place. Drop on Previous or Next to move between pages. Use arrow keys on a handle, or set a position directly.</p><label class="wishlist-inline-sort">Sort By<select id="' +
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
      '<div class="card-grid wishlist-sort-grid ' +
      mode +
      '-sort-grid" role="list" aria-label="Arrange ' +
      title +
      '">' +
      order
        .slice(offset, offset + CARD_ORDER_PAGE_SIZE)
        .map((id, i) => {
          const c = cardBy(id),
            item = items.get(id) || {};
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
            (offset + i + 1) +
            '" aria-label="Position for ' +
            e(c.name) +
            '"></label></div>' +
            cardSurface(
              c,
              {
                level: item.level || 1,
                showLevel: mode === "showcase",
                protectedCard: !!item.protected,
                wishlisted: !!item.wishlisted,
              },
              helpers,
            ) +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
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
