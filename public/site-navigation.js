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
const pages = new Set([...SITE_ROUTES.map(([id]) => id), "collection", "titles"]);
export function isPlayerRoute(route) {
  return pages.has(route) || /^player\/[^/]+$/.test(route) || /^pickems\/[1-9]\d*$/.test(route);
}
export function resolvePage(route) {
  route = route.replace(/^#/, "");
  return isPlayerRoute(route) ? route.split("/")[0] : "home";
}
const basePath = typeof location === "undefined" ? "/" : new URL(".", import.meta.url).pathname;
function staticDemo() {
  return typeof location !== "undefined" && (location.hostname.endsWith(".github.io") ||
    new URLSearchParams(location.search).has("demo") || location.protocol === "file:");
}
export function routeHref(route) {
  if (staticDemo()) return basePath + (new URLSearchParams(location.search).has("demo") ? "?demo=1" : "") + "#" + route;
  return basePath + (route === "home" ? "" : route);
}
export function currentRoute() {
  if (staticDemo()) return location.hash.slice(1) || "home";
  return location.pathname.slice(basePath.length).replace(/\/$/, "") || "home";
}
export function installNavigation(onChange) {
  // Pin relative API, asset and host-console URLs across history changes.
  const base = document.querySelector("base") || document.createElement("base");
  base.href = basePath;
  document.head.prepend(base);
  const legacy = () => {
    const route = location.hash.slice(1);
    if (!staticDemo() && isPlayerRoute(route))
      history.replaceState(history.state, "", routeHref(route) + location.search);
  };
  legacy();
  document.querySelector(".brand").href = routeHref("home");
  if (staticDemo()) {
    window.addEventListener("hashchange", onChange);
    return;
  }
  let last = location.href;
  function changed() {
    legacy();
    if (last === location.href) return;
    last = location.href;
    onChange();
  }
  window.addEventListener("popstate", changed);
  window.addEventListener("hashchange", changed);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(basePath) || url.hash || url.search ||
        !isPlayerRoute(url.pathname.slice(basePath.length) || "home")) return;
    event.preventDefault();
    navigate(url.pathname.slice(basePath.length) || "home");
  });
}
export function navigate(route) {
  const href = routeHref(route);
  if (staticDemo()) location.hash = route;
  else if (location.pathname !== href || location.hash) {
    history.pushState(null, "", href);
    window.dispatchEvent(new Event("popstate"));
  }
}
export function navigationSection(route, selfId, profileId) {
  if (["collection", "titles"].includes(route)) return "profile";
  if (route === "player")
    return selfId && profileId === selfId ? "profile" : "players";
  return route;
}
