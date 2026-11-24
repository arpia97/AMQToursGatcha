const bellUrl = new URL("./notification-bell.mp3", import.meta.url);
const preferenceKey = "amqtours-notification-sound";
let localEnabled = true;

function soundEnabled() {
  try { return localStorage.getItem(preferenceKey) !== "off"; }
  catch { return localEnabled; }
}

export function notificationSoundControl() {
  return '<label class="inbox-pref">Notification Sound<input type="checkbox" role="switch" data-notification-sound'+
    (soundEnabled()?' checked':'')+'></label>';
}

export function bindNotificationSoundControl(root) {
  root.querySelector("[data-notification-sound]").addEventListener("change",event=>{
    localEnabled = event.target.checked;
    try { localStorage.setItem(preferenceKey,localEnabled?"on":"off"); }
    catch { /* The choice still applies for the current page. */ }
  });
}

export function installNotificationSound() {
  let player, latest;
  let context, sample;

  function unlock() {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state !== "running") void context.resume().catch(() => {});
      sample ??= fetch(bellUrl).then(async response => {
        if (!response.ok) throw Error("Notification sound unavailable.");
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(() => { sample = null; });
    } catch { /* Browsers can restrict audio until the user interacts. */ }
  }
  document.addEventListener("click", unlock, {capture: true});
  document.addEventListener("keydown", unlock, {capture: true});

  return function observe(owner, notificationId) {
    if (owner !== player) {
      player = owner;
      latest = undefined;
    }
    if (!owner || !Number.isSafeInteger(notificationId)) return;
    const isNew = latest !== undefined && notificationId > latest;
    latest = Math.max(latest ?? 0, notificationId);
    if (!isNew || !sample || !soundEnabled() || document.hidden || !document.hasFocus()) return;
    void sample.then(buffer => {
      if (!buffer || player !== owner || !soundEnabled() || context.state !== "running" || document.hidden || !document.hasFocus()) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => source.disconnect();
      source.start();
    }).catch(() => {});
  };
}
