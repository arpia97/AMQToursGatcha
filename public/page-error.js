import { routeHref } from "./site-navigation.js";
export function pageErrorHTML(error, page, escape) {
  const profile = page === "profile" || page === "player";
  const missing = profile && error.status === 404;
  const title = missing
    ? "That Collector Could Not Be Found."
    : profile
      ? "This Profile Could Not Be Loaded."
      : "This Page Could Not Be Loaded.";
  return `<div class="empty"><h3>${title}</h3><p>${escape(error.message || "Please try again.")}</p>${missing ? '<a class="button secondary" href="' + routeHref("players") + '">Search Players</a>' : '<button class="button secondary" data-action="retry-page">Try Again</button>'}</div>`;
}
