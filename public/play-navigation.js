export const PLAY_MODES = Object.freeze([
  { id: "ngmc-ranked", name: "NGMC Ranked", short: "NGMC", icon: "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5", caption: "A new stage for ranked play." },
  { id: "2v2-arena", name: "2v2 Arena", short: "2v2", icon: "M9 5 3 3l2 6 13 12 3-3L9 5ZM15 5l6-2-2 6M3 21l6-6M3 17l4 4", caption: "Find your partner. Enter the arena." },
  { id: "song-artist", name: "Song/Artist", short: "Song/Artist", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z", caption: "Put a name to the music." },
  { id: "speed-showdown", name: "Speed Showdown", short: "Speed", icon: "m13 2-9 12h7l-1 8L21 9h-8l1-7Z", caption: "Every second counts." },
  { id: "quiz", name: "Quiz", short: "Quiz", icon: "M9 18V5l12-2v13M9 7l12-2M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 16c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z", caption: "Your next perfect score starts here." },
]);
export function playRoute(pathname) {
  if (pathname === "/play" || pathname === "/play/") return PLAY_MODES[0].id;
  const id = pathname.replace(/\/$/, "").slice("/play/".length);
  return pathname.startsWith("/play/") && PLAY_MODES.some((mode) => mode.id === id) ? id : null;
}
export const playHref = (id) => "/play/" + id;
