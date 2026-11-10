import { quantityInput } from "./quantity-input.js";
import { blackjackTotal } from "./blackjack-rules.js";
export function blackjackUI(s, ui, { escape: e, number: n }) {
  const g = s.blackjack,
    active = g?.status === "active";
  const card = (c, i, hand) =>
    !c
      ? '<div class="blackjack-card blackjack-back" aria-label="Face-Down Dealer Card"><span>67</span></div>'
      : '<div class="blackjack-card ' +
        ([1, 2].includes(c.suit) ? "red" : "") +
        " " +
        (g.status === "complete" || i === hand.length - 1 ? "is-dealt" : "") +
        '" style="--deal-delay:' +
        i * 90 +
        'ms" aria-label="' +
        e(
          [
            "",
            "Ace",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
            "Jack",
            "Queen",
            "King",
          ][c.rank] +
            " of " +
            ["Spades", "Hearts", "Diamonds", "Clubs"][c.suit],
        ) +
        '"><b>' +
        ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
          c.rank
        ] +
        "</b><span>" +
        ["♠", "♥", "♦", "♣"][c.suit] +
        "</span><small>" +
        (c.rank === 1 ? "7 / 37" : Math.min(c.rank, 10) * 3) +
        "</small></div>";
  const hand = (cards) =>
    '<div class="blackjack-hand">' +
    cards.map((c, i) => card(c, i, cards)).join("") +
    "</div>";
  const labels = {
    blackjack: "67 Blackjack!",
    win: "You Win",
    push: "Push · Stake Returned",
    bust: "Busted",
    loss: "Dealer Wins",
    "dealer-blackjack": "Dealer Blackjack",
  };
  const attrs = active
    ? 'data-game="' + g.id + '" data-version="' + g.version + '"'
    : "";
  return (
    '<section class="blackjack-panel"><div class="section-head"><div><h2>67 Blackjack</h2><p>Get closer to 67 than the dealer without going over.</p></div><div class="toolbar"><span class="pill">Dealer Stands on 52</span><button class="button secondary" data-action="gambling-history" data-game="blackjack">History</button></div></div><div class="blackjack-table"><div class="blackjack-seat"><h3>Dealer <span>' +
    (g ? (active ? "One Card Hidden" : blackjackTotal(g.dealer).total) : "—") +
    "</span></h3>" +
    (g ? hand(g.dealer) : '<div class="blackjack-table-empty">67</div>') +
    '</div><div class="blackjack-table-line"></div><div class="blackjack-seat"><h3>Your Hand <span>' +
    (g ? g.total : "—") +
    "</span></h3>" +
    (g ? hand(g.hand) : "<p>Choose your stake to deal.</p>") +
    "</div></div>" +
    (active
      ? '<div class="blackjack-controls"><span class="money">Stake · ✦ ' +
        n(g.stake) +
        '</span><button class="button mint" data-action="blackjack-hit" ' +
        attrs +
        '>Hit · Draw a Card</button><button class="button secondary" data-action="blackjack-stand" ' +
        attrs +
        ">Stand</button></div>"
      : (g
          ? '<div class="blackjack-result ' +
            (g.payout > g.stake
              ? "is-win"
              : g.result === "push"
                ? "is-push"
                : "is-loss") +
            '" role="status"><h3>' +
            labels[g.result] +
            "</h3><p>Return · ✦ " +
            n(g.payout) +
            " <span>Net · " +
            (g.payout - g.stake > 0 ? "+" : "") +
            n(g.payout - g.stake) +
            "</span></p></div>"
          : "") +
        '<form id="blackjack-bet" class="blackjack-controls">' +
        quantityInput({
          id: "blackjack-stake",
          name: "stake",
          label: "Stake",
          max: Math.max(1, Math.min(1000000, s.me?.balance || 1000000)),
          value: ui.blackjackStake || 100,
        }) +
        '<button class="button mint" type="submit">' +
        (!s.me ? "Sign In to Play" : g ? "Deal Again" : "Deal Cards") +
        '</button><div class="form-error" role="alert"></div></form>') +
    '<details class="mj-rules"><summary>67 Blackjack Rules &amp; Payouts</summary><div class="game-help"><h3>Custom Deck</h3><ul><li><strong>Shoe:</strong> 4 shuffled decks per hand.</li><li><strong>Card Values:</strong> 2–9 are worth 3× their face value (6 to 27); 10, J, Q, and K are worth 30; Aces count as 7 or 37 (whichever avoids busting).</li></ul><h3>Gameplay &amp; Dealer Rules</h3><ul><li><strong>Actions:</strong> Hit or stand only (no splits, doubles, or insurance). Going over 67 is a loss.</li><li><strong>Dealer:</strong> Hits below 52 and stands on 52 or higher (including soft hands).</li><li><strong>Privacy &amp; Saving:</strong> Your hand is saved between visits; the remaining shoe and dealer\'s hidden card stay private until the hand ends.</li></ul><h3>Betting &amp; Payouts</h3><ul><li><strong>Bet Limits:</strong> 1 to 1,000,000 whole credits per hand (up to your available balance).</li><li><strong>Blackjack (2-Card 67):</strong> Beats other 67s and pays 2.5× your stake.</li><li><strong>Standard Win / Tie:</strong> Regular wins pay 2× your stake; ties return your stake. All payouts include your original stake and round down to whole credits.</li></ul></div></details></section>'
  );
}
