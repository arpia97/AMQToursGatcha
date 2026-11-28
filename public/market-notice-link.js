// Encode the destination in the link so the same notice works from Gacha and Play.
export function marketNoticeHref(row, card, routeHref) {
  const meta = row.metadata || {};
  let page = "shop", section, view;
  switch (row.kind) {
    case "jam-invite": return routeHref("music")+"?tab=jam";
    case "flash-open": section = "buy"; break;
    case "wish-shop": section = meta.venue ? "buy" : "market"; break;
    case "market-sale": section = "listings"; break;
    case "wish-trade":
    case "trade-request":
      section = "trades";
      view = row.kind === "trade-request" ? "listings" : "browse";
      break;
    case "community-auction":
    case "wish-auction":
    case "auction-sale":
    case "auction-buyout":
    case "outbid":
      page = "auctions";
      if (row.kind === "outbid") section = meta.auctionSection || "all";
      else if (row.kind === "wish-auction") section = meta.seller ? "user" : "community";
      else section = row.kind === "community-auction" ? "community" : "user";
      break;
    default: return "";
  }
  const url = new URL(routeHref(page), "https://amqtours.app");
  url.searchParams.set("section", section);
  if (view) url.searchParams.set("view", view);
  if(row.card?.startsWith('song-listing:'))url.searchParams.set('kind','song');
  else if (card?.kind === "character" || card?.kind === "seiyuu") url.searchParams.set("kind", card.kind);
  if (row.card && !row.card.startsWith('song-listing:') && card?.name && ["market","trades","user"].includes(section) &&
      !["auction-sale","auction-buyout"].includes(row.kind)) url.searchParams.set("q", card.name);
  return url.pathname + url.search + url.hash;
}

export function applyMarketNotice(page, params, ui) {
  const section = params.get("section");
  const query = (params.get("q") || "").slice(0, 100);
  const kind = ["character","seiyuu","song"].includes(params.get("kind")) ? params.get("kind") : "both";
  if (page === "shop" && ["buy","market","listings","trades"].includes(section)) {
    ui.shopSection = section;
    if (section === "market") ui.marketQuery = query;
    if (section === "trades") {
      ui.tradeView = params.get("view") === "listings" ? "listings" : "browse";
      ui.tradeKind = kind;
      ui.tradeQuery = query;
    }
  } else if (page === "auctions" && ["community","user","all"].includes(section)) {
    if (section === "user") ui.marketQuery = query;
  } else return null;
  return {kind, auctionSection: page === "auctions" && section !== "all" ? section : null};
}
