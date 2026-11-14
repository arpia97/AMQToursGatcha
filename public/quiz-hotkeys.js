export const QUIZ_HOTKEY_ACTIONS = Object.freeze([
  { id: "skip", label: "Skip Song", defaultKey: "Alt+S", hint: "Skip the current song" },
  { id: "restart", label: "Restart Quiz", defaultKey: "Alt+R", hint: "Restart the quiz from Song 1" },
  { id: "stop", label: "Stop Quiz", defaultKey: "Alt+Q", hint: "End this attempt and return to quizzes" },
  { id: "play", label: "Play / Replay Audio", defaultKey: "Alt+P", hint: "Play or replay the current clip" },
  { id: "focus", label: "Focus Answer Box", defaultKey: "/", hint: "Focus the anime answer input" },
  { id: "songs", label: "Song List", defaultKey: "Alt+L", hint: "Open or close the quiz song list" },
]);

export const DEFAULT_QUIZ_HOTKEYS = Object.freeze(
  Object.fromEntries(QUIZ_HOTKEY_ACTIONS.map((a) => [a.id, a.defaultKey])),
);

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);
const KNOWN_SPECIAL_KEYS = new Map([
  [" ", "Space"],
  ["spacebar", "Space"],
  ["space", "Space"],
  ["enter", "Enter"],
  ["escape", "Escape"],
  ["esc", "Escape"],
  ["arrowup", "ArrowUp"],
  ["arrowdown", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["arrowright", "ArrowRight"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["tab", "Tab"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
]);

function normalizeMainKey(rawKey) {
  if (typeof rawKey !== "string" || !rawKey || MODIFIER_KEYS.has(rawKey)) return "";
  const lower = rawKey.toLowerCase();
  if (KNOWN_SPECIAL_KEYS.has(lower)) return KNOWN_SPECIAL_KEYS.get(lower);
  if (/^f([1-9]|1[0-2])$/i.test(rawKey)) return rawKey.toUpperCase();
  if (rawKey.length === 1) {
    return /^[a-z]$/i.test(rawKey) ? rawKey.toUpperCase() : rawKey;
  }
  return "";
}

export function normalizeHotkeyCombo(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return "";
  const parts = trimmed.split(/\+(?!$)/).map((p) => p.trim()).filter(Boolean);
  const keyPart = parts.pop();
  const main = normalizeMainKey(keyPart);
  if (!main) return "";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const ordered = [];
  if (mods.has("ctrl") || mods.has("control")) ordered.push("Ctrl");
  if (mods.has("alt")) ordered.push("Alt");
  if (mods.has("shift")) ordered.push("Shift");
  if (mods.has("meta") || mods.has("cmd")) ordered.push("Meta");
  ordered.push(main);
  return ordered.join("+");
}

export function formatHotkeyEvent(event) {
  if (!event || MODIFIER_KEYS.has(event.key)) return "";
  const main = normalizeMainKey(event.key);
  if (!main) return "";
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  // Ignore Shift for symbols whose character already implies shift (like "?" or "/"),
  // while preserving Shift+Letter or Shift+Enter.
  if (event.shiftKey && (/^[A-Z]$/.test(main) || main.length > 1))
    parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(main);
  return parts.join("+");
}

export function normalizeQuizHotkeys(raw) {
  const out = { ...DEFAULT_QUIZ_HOTKEYS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const action of QUIZ_HOTKEY_ACTIONS) {
    if (!Object.hasOwn(raw, action.id)) continue;
    const val = raw[action.id];
    if (val === "" || val === null) {
      out[action.id] = "";
      continue;
    }
    const normalized = normalizeHotkeyCombo(String(val));
    if (normalized) out[action.id] = normalized;
  }
  return out;
}

export function parseQuizHotkeysJSON(text) {
  if (!text || typeof text !== "string") return { ...DEFAULT_QUIZ_HOTKEYS };
  try {
    return normalizeQuizHotkeys(JSON.parse(text));
  } catch {
    return { ...DEFAULT_QUIZ_HOTKEYS };
  }
}

export function matchesHotkey(event, combo, { isEditable = false } = {}) {
  if (!combo || !event) return false;
  const pressed = formatHotkeyEvent(event);
  if (!pressed || pressed !== combo) return false;
  const hasStrongModifier = Boolean(
    event.ctrlKey || event.altKey || event.metaKey || /^F\d{1,2}$/.test(combo),
  );
  if (isEditable && !hasStrongModifier && combo !== "Escape") return false;
  return true;
}

export function hotkeyActionForEvent(event, config, { isEditable = false } = {}) {
  const hotkeys = normalizeQuizHotkeys(config);
  for (const { id } of QUIZ_HOTKEY_ACTIONS) {
    if (matchesHotkey(event, hotkeys[id], { isEditable })) return id;
  }
  return null;
}
