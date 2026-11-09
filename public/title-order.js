export function titleOrderKey(title) {
  return title.source === "card" || title.card
    ? "award:" + title.award
    : "quiz:" + title.quiz;
}

export function createTitleOrderEditor() {
  let owner = null,
    source = null,
    original = [],
    order = [],
    titles = new Map();
  function open(data, player) {
    if (!player || (data.player && data.player !== player))
      throw Error("You can arrange only your own titles.");
    owner = player;
    source = data;
    original = (data.titles || []).map(titleOrderKey);
    order = [...original];
    titles = new Map(
      (data.titles || []).map((t) => [titleOrderKey(t), { ...t }]),
    );
  }
  function move(id, position) {
    const from = order.indexOf(id);
    if (
      from < 0 ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= order.length
    )
      return false;
    order.splice(from, 1);
    order.splice(position, 0, id);
    return true;
  }
  return {
    open,
    move,
    cards: () => [...order],
    activeFor: (player) => owner === player && !!source,
    close: () => {
      owner = null;
      source = null;
    },
    dirty: () =>
      order.some((id, i) => id !== original[i]) ||
      (source?.titles || []).some(
        (t) => titles.get(titleOrderKey(t))?.equipped !== t.equipped,
      ),
    data: () => ({
      ...source,
      titles: order.map((id) => ({ ...titles.get(id) })),
    }),
    setEquipped(id, value) {
      if (titles.has(id)) titles.get(id).equipped = !!value;
    },
    drop(id, target, after = false) {
      const remaining = order.filter((key) => key !== id),
        at = remaining.indexOf(target);
      return at >= 0 && move(id, at + (after ? 1 : 0));
    },
    payload(player) {
      if (player !== owner || !source)
        throw Error("Sign in to the same account before saving.");
      const shown = order.map((id) => titles.get(id)).filter((t) => t.equipped);
      return {
        quizzes: shown.filter((t) => !t.card).map((t) => t.quiz),
        awards: shown.filter((t) => t.card).map((t) => t.award),
        order: [...order],
        expectedOrder: [...original],
      };
    },
  };
}
