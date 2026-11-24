import { DEFAULT_QUIZ_HOTKEYS, QUIZ_HOTKEY_ACTIONS, formatHotkeyEvent, normalizeQuizHotkeys } from "./quiz-hotkeys.js";

export function mountQuizHotkeys(form, saved, save) {
  const draft = normalizeQuizHotkeys(saved);
  form.innerHTML = '<p class="form-hint">Select a shortcut and press the keys you want to use. Tab moves to the next field.</p>' +
    '<div class="hotkey-grid">' + QUIZ_HOTKEY_ACTIONS.map(({id,label,hint}) =>
      `<div class="hotkey-row"><div><strong>${label}</strong><small>${hint}</small></div>
       <div class="hotkey-controls"><input readonly class="hotkey-capture" name="${id}" aria-label="${label} hotkey" placeholder="Unbound">
       <button type="button" class="text-button" data-clear="${id}" aria-label="Clear ${label} hotkey">Clear</button></div></div>`).join("") +
    '</div><div class="hotkey-footer"><button type="button" class="text-button" data-reset>Reset Defaults</button></div>' +
    '<div role="status" aria-live="polite"></div><button type="submit" class="button">Save Quiz Hotkeys</button>';
  const status = form.querySelector("[role=status]");
  function setKey(id, key) {
    form.elements.namedItem(id).value = draft[id] = key;
    status.textContent = "";
  }
  for (const {id} of QUIZ_HOTKEY_ACTIONS) setKey(id, draft[id]);
  form.addEventListener("keydown", event => {
    const input = event.target;
    if (!input.matches(".hotkey-capture") || event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { input.blur(); return; }
    if (event.key === "Backspace" || event.key === "Delete") { setKey(input.name, ""); return; }
    const combo = formatHotkeyEvent(event);
    if (combo) setKey(input.name, combo);
  });
  form.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (button?.dataset.clear) setKey(button.dataset.clear, "");
    if (button?.hasAttribute("data-reset"))
      for (const {id} of QUIZ_HOTKEY_ACTIONS) setKey(id, DEFAULT_QUIZ_HOTKEYS[id]);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    for (const control of form.elements) control.disabled = true;
    try {
      await save({...draft});
      status.textContent = "Quiz hotkeys saved.";
    } catch (error) {
      status.textContent = error.message || "Could not save quiz hotkeys.";
    } finally {
      for (const control of form.elements) control.disabled = false;
    }
  });
}
