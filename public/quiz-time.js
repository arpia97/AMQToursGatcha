export function quizElapsed(startedAt, endAt) {
  return Number.isSafeInteger(startedAt) &&
    Number.isSafeInteger(endAt) &&
    endAt >= startedAt
    ? endAt - startedAt
    : null;
}
export function quizDuration(ms, precise = true) {
  if (!Number.isSafeInteger(ms) || ms < 0) return "Not Recorded";
  const hours = Math.floor(ms / 3600000),
    minutes = Math.floor(ms / 60000) % 60,
    seconds = Math.floor(ms / 1000) % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (
    (hours ? hours + ":" + pad(minutes) : String(Math.floor(ms / 60000))) +
    ":" +
    pad(seconds) +
    (precise ? "." + String(ms % 1000).padStart(3, "0") : "")
  );
}
