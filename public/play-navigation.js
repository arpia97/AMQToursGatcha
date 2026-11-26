import {DUEL_FORMAT,ONE_TEAM_MODE} from './play-mode-rules.js';

export const PLAY_MODES = Object.freeze([
  { id: "overview", name: "Overview", short: "Overview", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3Z" },
  { id: DUEL_FORMAT, name: "1v1 Ranked", short: "1v1", icon: "M8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM2 18v-2a4 4 0 0 1 5-3.9M22 18v-2a4 4 0 0 0-5-3.9m-4-2.1-3 5h4l-3 5" },
  { id: "ngmc-ranked", name: "NGMC Ranked", short: "NGMC", icon: "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" },
  { id: "song-artist", name: "Song/Artist", short: "Song/Artist", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z" },
  { id: ONE_TEAM_MODE, name: "1-Team", short: "1-Team", icon: "M12 20S3 14.6 3 8.8a4.7 4.7 0 0 1 9-1.7 4.7 4.7 0 0 1 9 1.7C21 14.6 12 20 12 20Z" },
  { id: "variety", name: "Variety", short: "Variety", icon: "M3 4h7v7H3zM15 3l6 4-6 4zM4 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0ZM14 15h7v6h-7z" },
  { id: "custom-lobby", name: "Custom Lobby", short: "Lobbies", icon: "M3 4h18v6H3zM3 14h8v6H3zM15 17h6m-3-3v6" },
  { id: "speed-showdown", disabled: true, name: "Speed Showdown", short: "Speed", icon: "m13 2-9 12h7l-1 8L21 9h-8l1-7Z" },
  { id: "quiz", name: "Quiz", short: "Quiz", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z" },
  { id: "rankings", name: "Rankings", short: "Rankings", icon: "M4 21V12h4v9m2 0V4h4v17m2 0V9h4v12" },
]);
const hostPage = {id:'host', name:'Play Host Console'};
export const playPage = id => id === 'host' ? hostPage : PLAY_MODES.find(item => item.id === id);

export function playRoute(pathname) {
  if (pathname === "/play" || pathname === "/play/") return "overview";
  const id = pathname.replace(/\/$/, "").slice("/play/".length);
  return pathname.startsWith("/play/") && playPage(id) ? id : null;
}
export const playHref = (id) => "/play/" + id;
export function playQuizHref(quiz) {
  return playHref("quiz") + (quiz ? "?" + new URLSearchParams({quiz}) : "");
}
