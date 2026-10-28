export function noticeCopy(notice) {
  switch (notice.kind) {
    case "market-sale":
      return {
        title: "Your marketplace card sold",
        detail: "Credits have been added to your wallet.",
        credit: "Received",
        sign: "+",
      };
    case "auction-sale":
      return {
        title: "Your auction card sold",
        detail: "The winning bid has been paid to your wallet.",
        credit: "Received",
        sign: "+",
      };
    case "outbid":
      return {
        title: "You were outbid",
        detail: "Your held bid has been returned to your wallet.",
        credit: "Refunded",
        sign: "+",
      };
    case "auction-buyout":
      return {
        title: "You won the auction",
        detail: "The card was added to your collection by buyout.",
        credit: "Paid",
        sign: "−",
      };
    default:
      return {
        title: "Collection update",
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
  return `<section class="trade-notices"><span class="eyebrow">SINCE YOUR LAST VISIT</span><h2>Your collection updates</h2><div class="trade-notice-list">${notices
    .map((notice) => {
      const copy = noticeCopy(notice),
        card = cardBy(notice.card);
      return `<article class="trade-notice tier-${rarityClass(card.rarity)}"><div class="trade-notice-portrait">${image(card)}</div><div><h3>${e(copy.title)}</h3><strong>${e(card.name)} <small>Lv. ${notice.level || 1}</small></strong><p>${e(copy.detail)}</p><span class="money">${copy.sign}✦ ${n(notice.credits)} · ${e(copy.credit)}</span></div></article>`;
    })
    .join(
      "",
    )}</div><button type="button" class="button mint" data-close-dialog>Got it</button></section>`;
}
