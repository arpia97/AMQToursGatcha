import { cardFrameClass, cardAura, enhancementBadge } from "./card-frames.js";
import { quizDuration } from "./quiz-time.js";
import { quizRarity } from "./quiz-rules.js";
function formatQuizAttempt(score, durationMs) {
  if (!Number.isInteger(score)) return "";
  const time =
    Number.isSafeInteger(durationMs) && durationMs >= 0
      ? ` (${quizDuration(durationMs)})`
      : "";
  return `${score} / 20${time}`;
}
export function noticeCopy(notice) {
  switch (notice.kind) {
    case "quiz-leader-beaten": {
      const byName = notice.metadata?.byName || "Another player",
        nextAttempt = formatQuizAttempt(
          notice.metadata?.score ?? 0,
          notice.metadata?.durationMs,
        ),
        previousAttempt = formatQuizAttempt(
          notice.metadata?.previousScore,
          notice.metadata?.previousDurationMs,
        );
      return {
        title: "Your #1 Quiz Score Was Beaten",
        detail:
          `${byName} took #1 with ${nextAttempt}` +
          (previousAttempt
            ? `, beating your #1 score of ${previousAttempt}.`
            : "."),
        credit: "",
        sign: "",
      };
    }
    case "trade-request":
      return {
        title: "New Trade Offer",
        detail:
          (notice.metadata?.name || "A collector") +
          " offered " +
          (notice.metadata?.count || 1) +
          " card(s)" +
          (Number(notice.credits) > 0
            ? " and " + Number(notice.credits).toLocaleString("en-US") + " credits"
            : "") +
          " for your listing.",
        credit: Number(notice.credits) > 0 ? "Offered" : "",
        sign: Number(notice.credits) > 0 ? "+" : "",
      };
    case "market-sale":
      return {
        title: "Your Marketplace Card Sold",
        detail: "Credits have been added to your wallet.",
        credit: "Received",
        sign: "+",
      };
    case "auction-sale":
      return {
        title: "Your Auction Card Sold",
        detail: "The winning bid has been paid to your wallet.",
        credit: "Received",
        sign: "+",
      };
    case "outbid":
      return {
        title: "You Were Outbid",
        detail: "Your held bid has been returned to your wallet.",
        credit: "Refunded",
        sign: "+",
      };
    case "auction-buyout":
      return {
        title: "You Won the Auction",
        detail: "The card was added to your collection by buyout.",
        credit: "Paid",
        sign: "−",
      };
    default:
      return {
        title: "Collection Update",
        detail: "",
        credit: "Credits",
        sign: "",
      };
  }
}
export function noticePanel(
  notices,
  { escape: e, number: n, cardBy, image, rarityClass },
) {
  if (!notices.length) return "";
  const heading = notices.every(
    (notice) => notice.kind === "quiz-leader-beaten",
  )
    ? "Your Quiz Updates"
    : "Your Collection Updates";
  return `<section class="trade-notices"><span class="eyebrow">SINCE YOUR LAST VISIT</span><h2>${heading}</h2><div class="trade-notice-list">${notices
    .map((notice) => {
      const copy = noticeCopy(notice);
      if (notice.kind === "quiz-leader-beaten") {
        const tier = rarityClass(quizRarity(notice.metadata?.score ?? 0)),
          quizName = notice.metadata?.quizName || "Music Quiz",
          cover = notice.metadata?.cover
            ? `<img src="${e(notice.metadata.cover)}" alt="${e(quizName)}" loading="lazy">`
            : `<div class="fallback-img" aria-label="Quiz">♪</div>`;
        return `<article class="trade-notice tier-${tier}"><div class="trade-notice-portrait tier-${tier}">${cover}</div><div><h3>${e(copy.title)}</h3><strong>${e(quizName)}</strong><p>${e(copy.detail)}</p><button type="button" class="button secondary" data-action="quiz-notice-open" data-quiz="${e(notice.metadata?.quiz || "")}">View Quiz Leaderboard →</button></div></article>`;
      }
      const card = cardBy(notice.card);
      return `<article class="trade-notice tier-${rarityClass(card.rarity)}"><div class="trade-notice-portrait tier-${rarityClass(card.rarity)} ${cardFrameClass(notice.level)}">${cardAura(notice.level)}${image(card)}</div><div><h3>${e(copy.title)}</h3><strong>${e(card.name)} ${enhancementBadge(notice.level)}</strong><p>${e(copy.detail)}</p>${notice.kind === "trade-request" ? `<button type="button" class="button secondary" data-action="trade-notice-open" data-card="${e(notice.card)}">Review Trade Offers →</button>${Number(notice.credits) > 0 ? `<span class="money">+✦ ${n(notice.credits)} · Offered</span>` : ""}` : `<span class="money">${copy.sign}✦ ${n(notice.credits)} · ${e(copy.credit)}</span>`}</div></article>`;
    })
    .join(
      "",
    )}</div><button type="button" class="button mint" data-close-dialog>Got it</button></section>`;
}
