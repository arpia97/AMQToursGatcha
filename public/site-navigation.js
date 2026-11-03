export const SITE_ROUTES = [
  ["home", "Overview"],
  ["profile", "My Profile"],
  ["packs", "Card Packs"],
  ["shop", "Shop"],
  ["auctions", "Auctions"],
  ["pickems", "Pick’ems"],
  ["fusion", "Card Alchemy"],
  ["catalog", "Catalogue"],
  ["arcade", "Pachinko"],
  ["quiz", "Quiz"],
  ["players", "Players"],
  ["ranks", "Rankings"],
];
export function resolvePage(hash) {
  if (hash.startsWith("#player/")) return "player";
  const id = hash.slice(1);
  return ["collection", "titles"].includes(id) ||
    SITE_ROUTES.some(([route]) => route === id)
    ? id
    : "home";
}
export function navigationSection(route, selfId, profileId) {
  if (["collection", "titles"].includes(route)) return "profile";
  if (route === "player")
    return selfId && profileId === selfId ? "profile" : "players";
  return route;
}
