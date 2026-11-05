export const CARD_SIZES = ["small", "medium", "large"];
export function cardSizeControl(size = "medium") {
  return (
    '<label class="card-size-control">Card Size<select class="card-size-select" aria-label="Card Size">' +
    CARD_SIZES.map(
      (value) =>
        '<option value="' +
        value +
        '" ' +
        (value === size ? "selected" : "") +
        ">" +
        value[0].toUpperCase() +
        value.slice(1) +
        "</option>",
    ).join("") +
    "</select></label>"
  );
}
export function installCardSize(root, storage) {
  let size = "medium";
  try {
    const saved = storage.getItem("amqtours-card-size");
    if (CARD_SIZES.includes(saved)) size = saved;
  } catch {}
  root.documentElement.dataset.cardSize = size;
  root.addEventListener("change", (event) => {
    if (
      !event.target.matches(".card-size-select") ||
      !CARD_SIZES.includes(event.target.value)
    )
      return;
    size = event.target.value;
    root.documentElement.dataset.cardSize = size;
    try {
      storage.setItem("amqtours-card-size", size);
    } catch {}
    root
      .querySelectorAll(".card-size-select")
      .forEach((select) => (select.value = size));
  });
  return () => size;
}
