// Connected minus/value/plus control inspired by PriyanshuGupta28's Uiverse input.
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function nextQuantity(value, direction, min, max, step = 1) {
  if (!Number.isFinite(Number(value)) || String(value).trim() === "")
    return min;
  const offset = (Number(value) - min) / step;
  const units =
    direction > 0
      ? Math.floor(offset + 1e-9) + 1
      : Math.ceil(offset - 1e-9) - 1;
  return Math.min(max, Math.max(min, Number((min + units * step).toFixed(8))));
}
export function quantityInput({
  id,
  name,
  label,
  min = 1,
  max = 100,
  step = 1,
  value = 1,
  required = true,
}) {
  return (
    '<div class="quantity-field"><label for="' +
    escape(id) +
    '">' +
    escape(label) +
    '</label><div class="quantity-stepper" role="group" aria-label="' +
    escape(label) +
    '"><button type="button" data-quantity-step="-1" aria-label="Decrease ' +
    escape(label) +
    '" ' +
    (value <= min ? "disabled" : "") +
    '><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 9h14"/></svg></button><input id="' +
    escape(id) +
    '" name="' +
    escape(name) +
    '" type="number" inputmode="numeric" data-quantity-value min="' +
    escape(min) +
    '" max="' +
    escape(max) +
    '" step="' +
    escape(step) +
    '" value="' +
    escape(value) +
    '" ' +
    (required ? "required" : "") +
    '><button type="button" data-quantity-step="1" aria-label="Increase ' +
    escape(label) +
    '" ' +
    (value >= max ? "disabled" : "") +
    '><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 9h14M9 2v14"/></svg></button></div></div>'
  );
}
export function installQuantityInputs(root) {
  function sync(input) {
    const box = input.closest(".quantity-stepper");
    if (!box) return;
    const value = Number(input.value),
      valid = input.value.trim() !== "" && Number.isFinite(value);
    box.querySelector('[data-quantity-step="-1"]').disabled =
      input.disabled || (valid && value <= Number(input.min));
    box.querySelector('[data-quantity-step="1"]').disabled =
      input.disabled || (valid && value >= Number(input.max));
  }
  root.addEventListener("input", (ev) => {
    if (ev.target.matches?.("[data-quantity-value]")) sync(ev.target);
  });
  root.addEventListener("click", (ev) => {
    const button = ev.target.closest?.("[data-quantity-step]");
    if (!button || button.disabled) return;
    ev.preventDefault();
    const input = button.closest(".quantity-stepper").querySelector("input");
    if (input.disabled) return;
    input.value = String(
      nextQuantity(
        input.value,
        Number(button.dataset.quantityStep),
        Number(input.min),
        Number(input.max),
        Number(input.step) || 1,
      ),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    sync(input);
  });
}
