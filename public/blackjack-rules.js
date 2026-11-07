export const BLACKJACK_TARGET = 67;
export const BLACKJACK_DEALER_STAND = 52;
export const BLACKJACK_DECKS = 4;
export function blackjackTotal(hand) {
  const base = hand.reduce(
    (n, c) => n + (c.rank === 1 ? 7 : Math.min(c.rank, 10) * 3),
    0,
  );
  const soft = hand.some((c) => c.rank === 1) && base + 30 <= BLACKJACK_TARGET;
  return { total: base + (soft ? 30 : 0), soft };
}
export function blackjackNatural(hand) {
  return hand.length === 2 && blackjackTotal(hand).total === BLACKJACK_TARGET;
}
export function blackjackShoe(rand) {
  const cards = [];
  for (let deck = 0; deck < BLACKJACK_DECKS; deck++)
    for (let suit = 0; suit < 4; suit++)
      for (let rank = 1; rank <= 13; rank++) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export function blackjackView(game) {
  if (!game) return null;
  const { shoe, ...visible } = game;
  if (game.status === "active") visible.dealer = [game.dealer[0], null];
  visible.total = blackjackTotal(game.hand).total;
  visible.dealerTotal =
    game.status === "complete" ? blackjackTotal(game.dealer).total : null;
  return visible;
}

export function blackjackSettlement(game) {
  const total = blackjackTotal(game.hand).total;
  if (
    total <= BLACKJACK_TARGET &&
    !blackjackNatural(game.hand) &&
    !blackjackNatural(game.dealer)
  )
    while (blackjackTotal(game.dealer).total < BLACKJACK_DEALER_STAND)
      game.dealer.push(game.shoe.pop());
  const dealer = blackjackTotal(game.dealer).total;
  if (total > BLACKJACK_TARGET) return { result: "bust", payout: 0 };
  if (blackjackNatural(game.hand) && !blackjackNatural(game.dealer))
    return { result: "blackjack", payout: Math.floor((game.stake * 5) / 2) };
  if (blackjackNatural(game.dealer) && !blackjackNatural(game.hand))
    return { result: "dealer-blackjack", payout: 0 };
  if (dealer > BLACKJACK_TARGET || total > dealer)
    return { result: "win", payout: game.stake * 2 };
  if (total === dealer) return { result: "push", payout: game.stake };
  return { result: "loss", payout: 0 };
}
