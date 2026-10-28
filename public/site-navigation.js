export const SITE_ROUTES = [
  ["home", "Overview"],
  ["profile", "My Profile"],
  ["fusion", "Card fusion"],
  ["packs", "Card packs"],
  ["catalog", "Catalogue"],
  ["shop", "Shop"],
  ["auctions", "Auctions"],
  ["pickems", "Pick’ems"],
  ["players", "Players"],
  ["arcade", "Pachinko"],
  ["ranks", "Rankings"],
];
export function resolvePage(hash) {
  if (hash.startsWith("#player/")) return "player";
  const id = hash.slice(1);
  return id === "collection" || SITE_ROUTES.some(([route]) => route === id)
    ? id
    : "home";
}
export function navigationSection(route, selfId, profileId) {
  if (route === "collection") return "profile";
  if (route === "player")
    return selfId && profileId === selfId ? "profile" : "players";
  return route;
}
