export function installCardOrderDrag(
  root,
  editor,
  {
    changed,
    canEdit = () => true,
    prefix = "wishlist",
    visualPrefix = prefix,
    panel = ".wishlist-arrange-panel",
    capture = "#main",
    scrollSelector = null,
    pageSize = 24,
    pointerMouse = false,
  },
) {
  const win = root.defaultView;
  const attr = (name) => `data-${prefix}-${name}`,
    selector = (name) => `[${attr(name)}]`,
    value = (el, name) => el.getAttribute(attr(name)),
    cls = (name) => visualPrefix + "-" + name;
  let drag = null,
    ignoreClick = false,
    frame = null;
  const enabled = () => !!root.querySelector(panel) && canEdit();
  function clean() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = null;
    drag?.ghost?.remove();
    root
      .querySelectorAll(
        [
          "." + cls("drop-before"),
          "." + cls("drop-after"),
          "." + cls("dragging"),
          "." + cls("page-drop"),
        ].join(","),
      )
      .forEach((el) =>
        el.classList.remove(
          cls("drop-before"),
          cls("drop-after"),
          cls("dragging"),
          cls("page-drop"),
        ),
      );
    drag = null;
  }
  function targetAt(x, y) {
    const target = root.elementFromPoint(x, y),
      pager = target?.closest('[data-action="' + prefix + '-page"]');
    root
      .querySelectorAll(
        [
          "." + cls("drop-before"),
          "." + cls("drop-after"),
          "." + cls("page-drop"),
        ].join(","),
      )
      .forEach((el) =>
        el.classList.remove(
          cls("drop-before"),
          cls("drop-after"),
          cls("page-drop"),
        ),
      );
    if (pager && !pager.disabled) {
      pager.classList.add(cls("page-drop"));
      return { page: Number(pager.dataset.page) };
    }
    const card = target?.closest(selector("sort-card"));
    if (!card || value(card, "sort-card") === drag?.card) return null;
    const bounds = card.getBoundingClientRect(),
      grid = card.parentElement;
    const single =
      grid.children.length < 2 ||
      grid.children[1].getBoundingClientRect().left ===
        grid.children[0].getBoundingClientRect().left;
    const after = single
      ? y > bounds.top + bounds.height / 2
      : x > bounds.left + bounds.width / 2;
    card.classList.add(after ? cls("drop-after") : cls("drop-before"));
    return { card: value(card, "sort-card"), after };
  }
  function drop() {
    const current = drag,
      target = current?.target;
    clean();
    if (!target || !enabled()) return;
    if (target.page) {
      const ids = editor.cards();
      editor.move(
        current.card,
        Math.min(ids.length - 1, (target.page - 1) * pageSize),
      );
      editor.setPage(target.page);
    } else editor.drop(current.card, target.card, target.after);
    changed(current.card);
  }
  root.addEventListener("dragstart", (event) => {
    if (drag?.ghost) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest?.(selector("sort-card"));
    if (!card || !enabled() || event.target.closest("input")) return;
    drag = { card: value(card, "sort-card") };
    event.dataTransfer.setData("text/plain", drag.card);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add(cls("dragging"));
  });
  root.addEventListener("dragover", (event) => {
    if (!drag || !enabled()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    drag.target = targetAt(event.clientX, event.clientY);
  });
  root.addEventListener("drop", (event) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    drag.target = targetAt(event.clientX, event.clientY);
    drop();
  });
  root.addEventListener("dragend", clean);
  root.addEventListener("pointerdown", (event) => {
    if ((!pointerMouse && event.pointerType === "mouse") || !enabled()) return;
    const handle = event.target.closest?.(selector("handle"));
    if (!handle) return;
    event.preventDefault();
    const card = handle.closest(selector("sort-card")),
      rect = card.getBoundingClientRect(),
      ghost = card.cloneNode(true);
    ghost.classList.add(cls("drag-ghost"));
    ghost.setAttribute("aria-hidden", "true");
    ghost.removeAttribute("draggable");
    ghost.querySelectorAll("input,button").forEach((el) => (el.tabIndex = -1));
    Object.assign(ghost.style, {
      width: rect.width + "px",
      height: rect.height + "px",
      left: rect.left + "px",
      top: rect.top + "px",
    });
    root.body.append(ghost);
    card.classList.add(cls("dragging"));
    drag = {
      card: value(handle, "handle"),
      pointer: event.pointerId,
      ghost,
      scroller: scrollSelector && card.closest(scrollSelector),
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      x: event.clientX,
      y: event.clientY,
    };
    root.querySelector(capture)?.setPointerCapture?.(event.pointerId);
    const scroll = () => {
      if (!drag?.ghost) return;
      const scroller = drag.scroller,
        bounds = scroller?.getBoundingClientRect();
      const delta =
        drag.y < (bounds?.top || 0) + 65
          ? -12
          : drag.y > (bounds?.bottom || win.innerHeight) - 65
            ? 12
            : 0;
      if (delta) {
        if (scroller) scroller.scrollTop += delta;
        else win.scrollBy(0, delta);
        drag.target = targetAt(drag.x, drag.y);
      }
      frame = win.requestAnimationFrame(scroll);
    };
    frame = win.requestAnimationFrame(scroll);
  });
  root.addEventListener(
    "pointermove",
    (event) => {
      if (!drag?.ghost || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.ghost.style.left = event.clientX - drag.dx + "px";
      drag.ghost.style.top = event.clientY - drag.dy + "px";
      drag.target = targetAt(event.clientX, event.clientY);
    },
    { passive: false },
  );
  root.addEventListener(
    "pointerup",
    (event) => {
      if (!drag?.ghost || event.pointerId !== drag.pointer) return;
      ignoreClick = true;
      drop();
      win.setTimeout(() => (ignoreClick = false), 0);
    },
    true,
  );
  root.addEventListener("pointercancel", () => {
    if (drag?.ghost) clean();
  });
  root.addEventListener(
    "click",
    (event) => {
      if (ignoreClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  root.addEventListener("change", (event) => {
    if (!enabled()) return;
    if (event.target.id === prefix + "-sort") {
      editor.sortBy(event.target.value);
      changed();
    } else if (value(event.target, "rank")) {
      const id = value(event.target, "rank");
      editor.move(id, Number(event.target.value) - 1, true);
      changed(id);
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      clean();
      return;
    }
    if (!enabled()) return;
    if (value(event.target, "rank") && event.key === "Enter") {
      event.preventDefault();
      event.target.dispatchEvent(new win.Event("change", { bubbles: true }));
      return;
    }
    const handle = event.target.closest?.(selector("handle"));
    if (!handle) return;
    const keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const id = value(handle, "handle"),
      ids = editor.cards(),
      index = ids.indexOf(id),
      grid = handle.closest("." + cls("sort-grid")),
      columns = Math.max(
        1,
        win.getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? ids.length - 1
          : index +
            {
              ArrowLeft: -1,
              ArrowRight: 1,
              ArrowUp: -columns,
              ArrowDown: columns,
            }[event.key];
    if (editor.move(id, Math.max(0, Math.min(ids.length - 1, next)), true))
      changed(id);
  });
  return { cancel: clean };
}
