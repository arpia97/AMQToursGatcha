import {
  avatarCrop,
  DEFAULT_AVATAR_CROP,
  panAvatarCrop,
} from "./avatar-crop.js";
export function createAvatarEditor({ avatarHTML, getState, cardBy }) {
  const editors = new WeakMap();
  function mount(form, card, saved) {
    const area = form.querySelector("[data-avatar-editor]");
    if (!area) return;
    if (!card) {
      area.innerHTML = '<p class="form-hint">Your initials will be used.</p>';
      editors.delete(form);
      return;
    }
    const item = getState().inventory.find((i) => i.card === card);
    if (!item) {
      area.innerHTML = "";
      editors.delete(form);
      return;
    }
    let crop = avatarCrop(saved),
      drag = null;
    const data = { card, read: () => ({ ...crop }) };
    editors.set(form, data);
    area.innerHTML =
      '<div class="avatar-editor-layout"><div class="avatar-editor-stage" tabindex="0" role="group" aria-label="Profile picture crop; drag to move or use arrow keys">' +
      avatarHTML(
        {
          name: cardBy(card).name,
          avatar_card: card,
          avatar_crop: crop,
          avatar_level: item.level,
        },
        true,
      ) +
      '</div><div class="avatar-editor-controls"><p>Drag to choose the area inside the circle.</p><label>Zoom <output data-crop-zoom-label></output><input type="range" data-crop="zoom" aria-label="Profile picture zoom" min="1" max="3" step="0.01"></label><label>Horizontal Position<input type="range" data-crop="x" aria-label="Profile picture horizontal position" min="0" max="1" step="0.01"></label><label>Vertical Position<input type="range" data-crop="y" aria-label="Profile picture vertical position" min="0" max="1" step="0.01"></label><button type="button" class="text-button" data-crop-reset>Reset Crop</button></div></div>';
    const stage = area.querySelector(".avatar-editor-stage"),
      image = stage.querySelector("img"),
      frame = stage.querySelector(".avatar-crop");
    function update() {
      frame.style.setProperty("--avatar-x", crop.x * 100 + "%");
      frame.style.setProperty("--avatar-y", crop.y * 100 + "%");
      frame.style.setProperty("--avatar-zoom", crop.zoom);
      for (const key of ["x", "y", "zoom"])
        area.querySelector('[data-crop="' + key + '"]').value = crop[key];
      area.querySelector("[data-crop-zoom-label]").textContent =
        Math.round(crop.zoom * 100) + "%";
    }
    area.querySelectorAll("[data-crop]").forEach((input) =>
      input.addEventListener("input", () => {
        crop = { ...crop, [input.dataset.crop]: Number(input.value) };
        update();
      }),
    );
    area.querySelector("[data-crop-reset]").addEventListener("click", () => {
      crop = { ...DEFAULT_AVATAR_CROP };
      update();
    });
    stage.addEventListener("keydown", (ev) => {
      const moves = {
        ArrowLeft: [-0.02, 0],
        ArrowRight: [0.02, 0],
        ArrowUp: [0, -0.02],
        ArrowDown: [0, 0.02],
      };
      if (!moves[ev.key]) return;
      ev.preventDefault();
      const [dx, dy] = moves[ev.key];
      crop = {
        ...crop,
        x: Math.max(0, Math.min(1, crop.x + dx)),
        y: Math.max(0, Math.min(1, crop.y + dy)),
      };
      update();
    });
    stage.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || !image?.naturalWidth) return;
      ev.preventDefault();
      stage.setPointerCapture(ev.pointerId);
      drag = { x: ev.clientX, y: ev.clientY, crop: { ...crop } };
    });
    stage.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      crop = panAvatarCrop(
        drag.crop,
        ev.clientX - drag.x,
        ev.clientY - drag.y,
        frame.getBoundingClientRect().width,
        image.naturalWidth,
        image.naturalHeight,
      );
      update();
    });
    const end = () => {
      drag = null;
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("lostpointercapture", end);
    update();
  }
  return { mount, read: (form) => editors.get(form)?.read() };
}
