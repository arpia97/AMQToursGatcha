import { installCardOrderDrag } from "./card-order-drag.js";
import { createShowcaseEditor } from "./showcase-order.js";
import { cardSurface } from "./card-surface.js";
export const WISHLIST_PAGE_SIZE = 24;
export function createWishlistEditor(helpers) {
  const editor = createShowcaseEditor(helpers);
  let owner = null,
    active = false,
    page = 1;
  const order = () => editor.payload(owner).cards;
  const pages = () =>
    Math.max(1, Math.ceil(order().length / WISHLIST_PAGE_SIZE));
  return {
    open(profile, player, initialPage = 1) {
      editor.open(
        {
          ...profile,
          showcase: (profile.wishlist || []).map((card) => ({
            card,
            level: 1,
          })),
        },
        player,
      );
      owner = player;
      active = true;
      page = Math.max(1, Math.min(pages(), initialPage));
    },
    activeFor(player) {
      return active && owner === player;
    },
    cards() {
      return order();
    },
    close() {
      active = false;
    },
    currentPage() {
      return page;
    },
    setPage(next) {
      if (Number.isInteger(next) && next >= 1 && next <= pages()) page = next;
    },
    move(card, position, follow = false) {
      const moved = editor.move(card, position);
      if (moved && follow) page = Math.floor(position / WISHLIST_PAGE_SIZE) + 1;
      return moved;
    },
    drop(card, target, after = false) {
      const ids = order().filter((id) => id !== card),
        index = ids.indexOf(target);
      return index >= 0 && editor.move(card, index + (after ? 1 : 0));
    },
    sortBy(mode) {
      editor.sortBy(mode);
    },
    payload(player) {
      return editor.payload(player);
    },
    render() {
      const { escape: e, cardBy } = helpers,
        ids = order(),
        saved = editor.payload(owner).expectedCards;
      const changed = JSON.stringify(ids) !== JSON.stringify(saved),
        offset = (page - 1) * WISHLIST_PAGE_SIZE;
      const pager = () =>
        '<div class="toolbar wishlist-arrange-pager"><button type="button" class="button secondary" data-action="wishlist-page" data-page="' +
        (page - 1) +
        '" ' +
        (page <= 1 ? "disabled" : "") +
        ' title="Drop a card here to move it to the previous page">← Previous</button><span>Page ' +
        page +
        " of " +
        pages() +
        '</span><button type="button" class="button secondary" data-action="wishlist-page" data-page="' +
        (page + 1) +
        '" ' +
        (page >= pages() ? "disabled" : "") +
        ' title="Drop a card here to move it to the next page">Next →</button></div>';
      return (
        '<section class="profile-card-panel wishlist-arrange-panel"><form id="wishlist-order-form"><div class="section-head"><h2>Wishlist</h2><div class="wishlist-arrange-actions"><button type="button" class="button mint" data-action="wishlist-arrange" aria-pressed="true">Arrange Wishlist</button><button type="button" class="button secondary" data-action="wishlist-cancel">Cancel</button><button type="submit" class="button mint" ' +
        (!changed ? "disabled" : "") +
        '>Save Order</button></div></div><p class="form-hint" id="wishlist-drag-help">Drag cards into place. Drop on Previous or Next to move between pages. Use arrow keys on a handle, or set a position directly.</p><label class="wishlist-inline-sort">Sort By<select id="wishlist-sort"><option value="custom">Custom Order</option><option value="rarity">Rarity · Highest First</option><option value="name">Name · A–Z</option><option value="original">Restore Saved Order</option></select></label><div class="form-error" role="alert"></div>' +
        pager() +
        '<div class="card-grid wishlist-sort-grid" role="list" aria-label="Arrange Wishlist">' +
        ids
          .slice(offset, offset + WISHLIST_PAGE_SIZE)
          .map((id, i) => {
            const c = cardBy(id),
              position = offset + i;
            return (
              '<div class="wishlist-sort-card" data-wishlist-sort-card="' +
              e(id) +
              '" draggable="true" role="listitem"><div class="wishlist-sort-tools"><button type="button" class="wishlist-drag-handle" draggable="true" data-wishlist-handle="' +
              e(id) +
              '" aria-label="Move ' +
              e(c.name) +
              '" aria-describedby="wishlist-drag-help">⠿</button><label><span class="sr-only">Position for ' +
              e(c.name) +
              '</span><span aria-hidden="true">#</span><input type="number" data-wishlist-rank="' +
              e(id) +
              '" min="1" max="' +
              ids.length +
              '" value="' +
              (position + 1) +
              '" aria-label="Position for ' +
              e(c.name) +
              '"></label></div>' +
              cardSurface(c, {}, helpers) +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        pager() +
        '</form><span id="wishlist-arrange-status" class="sr-only" role="status"></span></section>'
      );
    },
  };
}
export function installWishlistDrag(root, editor, options) {
  return installCardOrderDrag(root, editor, options);
}
