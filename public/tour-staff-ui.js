import { defaultReward } from "./site-defaults.js";
export function chooseTourStaff(state, escape, initial = []) {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    const previousFocus = document.activeElement,
      shell = document.querySelector(".host-shell");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "tour-staff-title");
    dialog.tabIndex = -1;
    dialog.className = "tour-staff-dialog";
    let rows = initial.length
      ? initial.map((s) => ({ ...s }))
      : [
          { reason: "counting", player: "", games: 1 },
          { reason: "reporting", player: "", games: 1 },
        ];
    const options = state.players
      .map(
        (p) =>
          `<option value="${escape(p.id)}">${escape(p.name)} (${escape(p.id)})</option>`,
      )
      .join("");
    function draw() {
      dialog.innerHTML = `<form class="stack" id="tour-staff-form"><h2 id="tour-staff-title">Tour Counters & Reporters</h2><p>Choose everyone who helped and the number of rounds each worked. Counting and reporting pay 500 credits per round.</p><div class="staff-rows">${rows.map((row, i) => `<div class="form-grid" data-staff-row="${i}"><label>Work<select name="reason"><option value="counting" ${row.reason === "counting" ? "selected" : ""}>Counting</option><option value="reporting" ${row.reason === "reporting" ? "selected" : ""}>Reporting</option></select></label><label>Player<input name="player" list="staff-players" placeholder="Name, alias or Tours ID" value="${escape(row.player)}" autocomplete="off"></label><label>Rounds<input name="games" type="number" min="1" max="2000" value="${row.games}" required></label><button type="button" class="text-button" data-remove-staff="${i}">Remove</button></div>`).join("")}</div><datalist id="staff-players">${options}</datalist><button type="button" class="text-button" data-add-staff>Add Another Player ＋</button><p class="form-error" role="alert"></p><div class="toolbar"><button type="button" class="button secondary" data-cancel-staff>Cancel</button><button type="submit" class="button">Continue to Reward Review →</button></div></form>`;
    }
    function collect() {
      rows = [...dialog.querySelectorAll("[data-staff-row]")].map((el) => ({
        reason: el.querySelector("[name=reason]").value,
        player: el.querySelector("[name=player]").value.trim(),
        games: Number(el.querySelector("[name=games]").value),
      }));
    }
    function finish(value) {
      dialog.remove();
      if (shell) shell.inert = false;
      previousFocus?.focus({ preventScroll: true });
      resolve(value);
    }
    dialog.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-add-staff")) {
        collect();
        rows.push({ reason: "counting", player: "", games: 1 });
        draw();
      }
      if (b.hasAttribute("data-remove-staff")) {
        collect();
        rows.splice(Number(b.dataset.removeStaff), 1);
        draw();
      }
      if (b.hasAttribute("data-cancel-staff")) finish(null);
    });
    dialog.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      finish(null);
    });
    dialog.addEventListener("submit", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      collect();
      try {
        const staff = rows
          .filter((r) => r.player)
          .map((row) => {
            const q = row.player.toLowerCase();
            const id =
              state.players.find((p) => p.id === row.player)?.id ||
              state.aliases.find((a) => a.alias.toLowerCase() === q)?.player ||
              state.usernames?.find((a) => a.label.toLowerCase() === q)
                ?.player ||
              state.players.find((p) => p.name.toLowerCase() === q)?.id;
            if (!id) throw Error("Unknown player: " + row.player);
            if (
              !Number.isInteger(row.games) ||
              row.games < 1 ||
              row.games > 2000
            )
              throw Error("Enter 1–2,000 rounds.");
            return {
              ...row,
              player: id,
              amount: defaultReward(row.reason, row.games),
            };
          });
        finish(staff);
      } catch (err) {
        dialog.querySelector("[role=alert]").textContent = err.message;
      }
    });
    dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        finish(null);
        return;
      }
      if (ev.key !== "Tab") return;
      const controls = [
        ...dialog.querySelectorAll("input,select,button"),
      ].filter((el) => !el.disabled);
      const first = controls[0],
        last = controls.at(-1);
      if (
        ev.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        ev.preventDefault();
        last?.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first?.focus();
      }
    });
    draw();
    document.body.append(dialog);
    if (shell) shell.inert = true;
    dialog.focus();
  });
}
