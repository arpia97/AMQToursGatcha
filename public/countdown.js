export function countdownText(end, now, days = false) {
  let seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60),
    s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${days ? pad(d) + " days " : ""}${pad(days ? h : d * 24 + h)} hours ${pad(m)} minutes ${pad(s)} seconds`;
}
export function nextDailyReset(now) {
  return (
    Math.floor((now + 9 * 3600000) / 86400000) * 86400000 +
    86400000 -
    9 * 3600000
  );
}
export function nextWeeklyReset(now) {
  const monday = Date.UTC(2026, 0, 5),
    week = 7 * 86400000;
  return monday + (Math.floor((now - monday) / week) + 1) * week;
}

export function compactCountdownText(end, now) {
  let seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60),
    s = seconds % 60,
    pad = (n) => String(n).padStart(2, "0");
  return (d ? d + "d " : "") + pad(h) + "h " + pad(m) + "m " + pad(s) + "s";
}

export function clockCountdownText(end, now) {
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const pad = (value) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  return (hours ? hours + ":" : "") + pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60);
}
