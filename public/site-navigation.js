import {playQuizHref} from "./play-navigation.js?v=play-quiz-links";

export const SITE_ROUTES = [
  ["home", "Overview"],
  ["profile", "My Profile"],
  ["shop", "Shop"],
  ["music", "Music"],
  ["mine", "Aoji Credit Mine"],
  ["pickems", "Pick’ems"],
  ["fusion", "Card Alchemy"],
  ["arcade", "Pachinko"],
  ["quiz", "Quiz"],
  ["players", "Players"],
  ["ranks", "Rankings"],
  ["catalog", "Catalogue"],
];
const pages = new Set([...SITE_ROUTES.map(([id]) => id), "collection", "titles", "notifications", "packs", "auctions"]);
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
    if (staticDemo()) return;
    if (route === "quiz") {
      location.replace(playQuizHref() + location.search);
      return;
    }
    if (isPlayerRoute(route))
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
    const route = url.pathname.slice(basePath.length) || "home";
    if (url.origin !== location.origin || !url.pathname.startsWith(basePath) || url.hash ||
        (url.search && !(route==="catalog" && url.search==="?section=songs")) || !isPlayerRoute(route)) return;
    event.preventDefault();
    navigate(route,url.search);
  });
}
export function navigate(route,search="") {
  const href = routeHref(route)+search;
  if (staticDemo()) location.hash = route;
  else if (location.pathname+location.search !== href || location.hash) {
    history.pushState(null, "", href);
    window.dispatchEvent(new Event("popstate"));
  }
}
export function navigationSection(route, selfId, profileId) {
  if (["packs", "auctions"].includes(route)) return "shop";
  if (["collection", "titles"].includes(route)) return "profile";
  if (route === "player")
    return selfId && profileId === selfId ? "profile" : "players";
  return route;
}
