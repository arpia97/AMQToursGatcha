import { installCardOrderDrag } from "./card-order-drag.js";
import { createShowcaseEditor } from "./showcase-order.js";

export function createWishlistEditor(helpers) {
  const editor = createShowcaseEditor(helpers, { mode: "wishlist" });
  return {
    ...editor,
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
        initialPage,
      );
    },
  };
}
export function createCollectionEditor(helpers) {
  return createShowcaseEditor(helpers, { mode: "collection" });
}
export function installWishlistDrag(root, editor, options) {
  return installCardOrderDrag(root, editor, options);
}
