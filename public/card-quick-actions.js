const actions = {
  wishlist: ["Wishlist", '<path d="M12 20S3 14.1 3 8.5a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1C21 14.1 12 20 12 20Z"/>'],
  protect: ["Protect", '<path d="m12 2 8 3v6c0 4.6-3.1 8.2-8 11-4.9-2.8-8-6.4-8-11V5Z"/><path d="m8.5 11.8 2.3 2.3 4.7-5"/>'],
  trade: ["For Trade", '<path d="M12 3v18m-5 0h10M4 6h16M5 6l-3 7h6L5 6Zm14 0-3 7h6l-3-7Z"/>'],
  showcase: ["Showcase", '<path d="m14.8 2.8 6.4 6.4-2 1.2-1.4-.1-4.1 4.1-.6 3.7-7.2-7.2 3.7-.6 4.1-4.1-.1-1.4zM9.5 14.5l-6 6"/>'],
  favorite: ["Favorite", '<path d="m12 2.8 2.8 5.8 6.4 1-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-1Z"/>'],
};

export function cardFavoriteFlag(state, id) {
  if (!state?.me || !(state.inventory?.some(item => item.card === id && item.copies > 0) || state.heldCardIds?.includes(id))) return;
  return state.cardFavorites?.includes(id) ?? false;
}

// An omitted toggle is unavailable in this view. Explicit false means available and off.
export function cardQuickActions(card, flags, escape, disabled = []) {
  const buttons = Object.entries(actions).filter(([key]) => flags[key] !== undefined)
    .map(([key, [label, path]]) => `<button type="button" class="card-quick-button" data-action="${key}-toggle" data-id="${escape(card.id)}" aria-pressed="${!!flags[key]}" aria-label="${label}" title="${label}" ${disabled.includes(key) ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button>`);
  return `<div class="card-quick-actions" role="group" aria-label="Card preferences">${buttons.join("")}</div>`;
}
