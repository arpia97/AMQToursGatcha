import {DUEL_FORMAT} from './play-mode-rules.js';

export const PLAY_MODES = Object.freeze([
  { id: DUEL_FORMAT, name: "1v1 Ranked", short: "1v1", icon: "M8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM2 18v-2a4 4 0 0 1 5-3.9M22 18v-2a4 4 0 0 0-5-3.9m-4-2.1-3 5h4l-3 5" },
  { id: "ngmc-ranked", name: "NGMC Ranked", short: "NGMC", icon: "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" },
  { id: "2v2-arena", name: "2v2 Arena", short: "2v2", icon: "M9 5 3 3l2 6 13 12 3-3L9 5ZM15 5l6-2-2 6M3 21l6-6M3 17l4 4" },
  { id: "song-artist", name: "Song/Artist", short: "Song/Artist", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z" },
  { id: "speed-showdown", disabled: true, name: "Speed Showdown", short: "Speed", icon: "m13 2-9 12h7l-1 8L21 9h-8l1-7Z" },
  { id: "quiz", name: "Quiz", short: "Quiz", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z" },
  { id: "rankings", name: "Rankings", short: "Rankings", icon: "M4 21V12h4v9m2 0V4h4v17m2 0V9h4v12" },
]);
export function playRoute(pathname) {
  if (pathname === "/play" || pathname === "/play/") return "ngmc-ranked";
  const id = pathname.replace(/\/$/, "").slice("/play/".length);
  return pathname.startsWith("/play/") && PLAY_MODES.some((mode) => mode.id === id) ? id : null;
}
export const playHref = (id) => "/play/" + id;
