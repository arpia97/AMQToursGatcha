import { createShowcaseEditor } from "./showcase-order.js";
export function createWishlistEditor(helpers) {
  const editor = createShowcaseEditor(helpers);
  return {
    ...editor,
    open(profile, player) {
      return editor.open(
        {
          ...profile,
          showcase: (profile.wishlist || []).map((card) => ({
            card,
            level: 1,
          })),
        },
        player,
      );
    },
    render() {
      return editor
        .render()
        .replaceAll('id="showcase', 'id="wishlist')
        .replaceAll('data-action="showcase', 'data-action="wishlist')
        .replaceAll("data-showcase-position", "data-wishlist-position")
        .replace(/<option value="level"[^>]*>[^<]*<\/option>/, "")
        .replace("Arrange Showcase", "Arrange Wishlist")
        .replace(
          "Set the order shown on your profile.",
          "Put your most wanted cards first on your profile.",
        );
    },
  };
}
