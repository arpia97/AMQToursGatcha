import { marketNoticeHref } from "./market-notice-link.js";
import { routeHref } from "./site-navigation.js";
import { cardFrameClass, cardAura, enhancementBadge } from "./card-frames.js";
import { quizDuration } from "./quiz-time.js";
import { quizRarity } from "./quiz-rules.js";
import { playQuizHref } from "./play-navigation.js?v=play-quiz-links";
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
    case "quiz-personal-beaten":
    case "quiz-friend-beaten":
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
        title: notice.kind === "quiz-friend-beaten" ? "A Friend Beat Your Quiz Score" : notice.kind === "quiz-personal-beaten" ? "Your Quiz Score Was Beaten" : "Your #1 Quiz Score Was Beaten",
        detail:
          `${byName} ${notice.kind !== "quiz-leader-beaten" ? "moved ahead with" : "took #1 with"} ${nextAttempt}` +
          (previousAttempt
            ? `, beating your ${notice.kind !== "quiz-leader-beaten" ? "personal best" : "#1 score"} of ${previousAttempt}.`
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
        title: notice.metadata?.buyerName ? `${notice.metadata.buyerName} bought your ${notice.metadata.songName?"song":"card"}` : "Your Marketplace Card Sold",
        detail: "Credits have been added to your wallet.",
        credit: "Received",
        sign: "+",
      };
    case "auction-sale":
      return {
        title: notice.metadata?.buyerName
          ? `${notice.metadata.buyerName} ${notice.metadata.buyout ? "bought out" : "won"} your auction`
          : "Your Auction Card Sold",
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
    (notice) => ["quiz-leader-beaten","quiz-friend-beaten"].includes(notice.kind),
  )
    ? "Your Quiz Updates"
    : "Your Collection Updates";
  return `<section class="trade-notices"><span class="eyebrow">SINCE YOUR LAST VISIT</span><h2>${heading}</h2><div class="trade-notice-list">${notices
    .map((notice) => {
      const copy = noticeCopy(notice);
      if (["quiz-leader-beaten","quiz-friend-beaten"].includes(notice.kind)) {
        const tier = rarityClass(quizRarity(notice.metadata?.score ?? 0)),
          quizName = notice.metadata?.quizName || "Music Quiz",
          cover = notice.metadata?.cover
            ? `<img src="${e(notice.metadata.cover)}" alt="${e(quizName)}" loading="lazy">`
            : `<div class="fallback-img" aria-label="Quiz">♪</div>`;
        return `<article class="trade-notice tier-${tier}"><div class="trade-notice-portrait tier-${tier}">${cover}</div><div><h3>${e(copy.title)}</h3><strong>${e(quizName)}</strong><p>${e(copy.detail)}</p><a class="button secondary" href="${e(playQuizHref(notice.metadata?.quiz))}">View Quiz Leaderboard →</a></div></article>`;
      }
      const card = notice.metadata?.songName?{id:notice.card,name:notice.metadata.songName,kind:"song"}:cardBy(notice.card);
      const href = marketNoticeHref(notice, card, routeHref);
      const linkText = notice.kind === "trade-request" ? "Review Trade Offers" : notice.kind === "market-sale" ? "View Your Listings" : "View Auctions";
      const link = href ? `<a class="button secondary" data-inbox-link href="${e(href)}">${linkText} →</a>` : "";
      return `<article class="trade-notice tier-${rarityClass(card.rarity)}"><div class="trade-notice-portrait tier-${rarityClass(card.rarity)} ${cardFrameClass(notice.level)}">${cardAura(notice.level)}${image(card)}</div><div><h3>${e(copy.title)}</h3><strong>${e(card.name)} ${enhancementBadge(notice.level)}</strong><p>${e(copy.detail)}</p>${link}${notice.kind === "trade-request" ? `${Number(notice.credits) > 0 ? `<span class="money">+✦ ${n(notice.credits)} · Offered</span>` : ""}` : `<span class="money">${copy.sign}✦ ${n(notice.credits)} · ${e(copy.credit)}</span>`}</div></article>`;
    })
    .join(
      "",
    )}</div><button type="button" class="button mint" data-close-dialog>Got it</button></section>`;
}
