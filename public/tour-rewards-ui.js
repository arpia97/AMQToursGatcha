import {
  initialTourRewards,
  tourRewardQuote,
  tourRewardDefaults,
  TOUR_SIZES,
  STAFF_REWARD,
} from "./tour-rewards.js";
import { matchingCreditPlayers } from "./host-credit-ui.js";
const number = (value) => value.toLocaleString("en-US");
export function createTourRewardEditor(root, preview, meta, state, escape) {
  let plan = initialTourRewards(preview.players, preview);
  let validMaximum = plan.maxRounds;
  const people = new Map(
    [...state.players, ...preview.players].map((p) => [p.id, p]),
  );
  const name = (id) => people.get(id)?.name || id;
  function rowMarkup(row) {
    return `<article class="tour-reward-player" data-reward-player="${escape(row.player)}"><div class="tour-reward-player-head"><div><strong>${escape(name(row.player))}</strong><small>${escape(row.player)}${row.replaces ? " · Sub for " + escape(name(row.replaces)) : row.staffOnly ? " · Staff Only" : ""}</small></div>${row.replaces || row.staffOnly ? '<button type="button" class="text-button" data-remove-reward="' + escape(row.player) + '" aria-label="Remove ' + escape(name(row.player)) + '">×</button>' : ""}</div><div class="tour-reward-rounds"><label>Rounds Played<input type="number" name="rounds" min="0" max="${plan.maxRounds}" value="${row.rounds}" step="1" required ${row.staffOnly ? "disabled" : ""} aria-label="Rounds Played by ${escape(name(row.player))}"></label>${!row.staffOnly ? '<button type="button" class="button secondary" data-add-sub="' + escape(row.player) + '" aria-label="Sub for ' + escape(name(row.player)) + '">Sub ＋</button>' : ""}</div><div class="tour-reward-work"><label><input type="checkbox" name="count" ${row.count ? "checked" : ""}> Count <small>+750</small></label><label><input type="checkbox" name="report" ${row.report ? "checked" : ""}> Report <small>+750</small></label></div><div class="tour-reward-row-total" data-reward-total></div></article>`;
  }
  function draw() {
    const availableSizes = TOUR_SIZES.includes(plan.tourSize)
      ? TOUR_SIZES
      : [...TOUR_SIZES, plan.tourSize].sort((a, b) => a - b);
    root.innerHTML = `<form id="participation-batch" class="stack tour-reward-editor"><h3>Review Tour Rewards</h3><p class="form-hint">${escape(meta.event)} · ${escape(meta.note)}<br>Every pasted player starts at the maximum rounds. Adjust early leavers, add their Sub, and check Count or Report below each player.</p><div class="form-grid"><label>Tour Size<select name="tourSize">${availableSizes.map((size) => '<option value="' + size + '" ' + (size === plan.tourSize ? "selected" : "") + ">" + size + " Players</option>").join("")}</select></label><label>Maximum Rounds<input name="maxRounds" type="number" min="1" max="2000" step="1" value="${plan.maxRounds}" required></label></div><p class="form-hint" data-reward-rate></p><div class="tour-reward-grid">${plan.participants.map(rowMarkup).join("")}</div><button type="button" class="text-button" data-add-reward-helper>Add Counter / Reporter from Player Pool ＋</button><div class="notice" data-reward-summary aria-live="polite"></div><p class="form-error" data-reward-error role="alert"></p><button class="button" type="submit" data-award-tour>Award Reviewed Tour Rewards →</button></form>`;
    updateTotals();
  }
  function collect() {
    plan.tourSize = Number(root.querySelector("[name=tourSize]").value);
    plan.maxRounds = Number(root.querySelector("[name=maxRounds]").value);
    for (const el of root.querySelectorAll("[data-reward-player]")) {
      const row = plan.participants.find(
        (r) => r.player === el.dataset.rewardPlayer,
      );
      row.rounds = Number(el.querySelector("[name=rounds]").value);
      row.count = el.querySelector("[name=count]").checked;
      row.report = el.querySelector("[name=report]").checked;
    }
  }
  function updateTotals() {
    collect();
    try {
      const quote = tourRewardQuote(preview.players, plan);
      root.querySelector("[data-reward-rate]").textContent =
        `${number(quote.rate)} credits per played round · Count and Report each pay a flat ${STAFF_REWARD} credits per tour.`;
      for (const el of root.querySelectorAll("[data-reward-player]")) {
        const row = quote.rows.find(
          (r) => r.player === el.dataset.rewardPlayer,
        );
        el.querySelector("[data-reward-total]").textContent =
          `${number(row.participation)} Participation + ${number(row.counting + row.reporting)} Staff = ${number(row.total)} Credits`;
      }
      root.querySelector("[data-reward-summary]").textContent =
        `Participation: ${number(quote.participation)} · Staff: ${number(quote.staff)} · Total: ${number(quote.total)} Credits`;
      root.querySelector("[data-reward-error]").textContent = "";
      root.querySelector("[data-award-tour]").disabled = false;
    } catch (error) {
      root.querySelector("[data-reward-summary]").textContent =
        "Adjust the review to calculate the total.";
      root.querySelector("[data-reward-error]").textContent = error.message;
      root.querySelector("[data-award-tour]").disabled = true;
    }
  }
  function changeMaximum(value) {
    const previous = validMaximum;
    if (!Number.isInteger(value) || value < 1 || value > 2000)
      return updateTotals();
    for (const row of plan.participants) {
      if (row.staffOnly) continue;
      row.rounds =
        !row.replaces && row.rounds === previous
          ? value
          : Math.min(value, row.rounds);
      const input = [...root.querySelectorAll("[data-reward-player]")]
        .find((el) => el.dataset.rewardPlayer === row.player)
        .querySelector("[name=rounds]");
      input.max = value;
      input.value = row.rounds;
    }
    plan.maxRounds = value;
    validMaximum = value;
    root.querySelector("[name=maxRounds]").value = value;
    updateTotals();
  }
  root.addEventListener("input", (event) => {
    if (event.target.name === "maxRounds")
      return changeMaximum(Number(event.target.value));
    updateTotals();
  });
  root.addEventListener("change", (event) => {
    if (event.target.name === "maxRounds")
      return changeMaximum(Number(event.target.value));
    if (event.target.name === "tourSize") {
      collect();
      return changeMaximum(tourRewardDefaults(plan.tourSize).maxRounds);
    }
    updateTotals();
  });
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.removeReward) {
      collect();
      plan.participants = plan.participants.filter(
        (r) => r.player !== button.dataset.removeReward,
      );
      draw();
    }
    if (
      button.dataset.addSub ||
      button.hasAttribute("data-add-reward-helper")
    ) {
      collect();
      pickPlayer(button.dataset.addSub || null, button);
    }
  });
  function pickPlayer(outgoingId, previousFocus) {
    const outgoing = plan.participants.find((r) => r.player === outgoingId),
      rootId = outgoing?.replaces || outgoingId,
      family = plan.participants.filter(
        (r) => (r.replaces || r.player) === rootId,
      ),
      unused = plan.maxRounds - family.reduce((sum, r) => sum + r.rounds, 0),
      outgoingRounds = outgoing
        ? Math.max(0, outgoing.rounds - (unused > 0 ? 0 : 1))
        : 0;
    const dialog = document.createElement("div"),
      shell = document.querySelector(".host-shell");
    dialog.className = "tour-reward-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "reward-player-title");
    const title = outgoing ? "Add a Substitute" : "Add a Counter / Reporter";
    dialog.innerHTML = `<form class="stack"><h2 id="reward-player-title">${title}</h2>${outgoing ? "<p>Replacing " + escape(name(outgoingId)) + ". Split the rounds between the departing player and substitute.</p>" : ""}<label>Search All Players<input type="search" data-reward-search autocomplete="off" placeholder="Username, alias or Tours ID"></label><label>Player<select name="player" required></select></label>${outgoing ? '<div class="form-grid"><label>Rounds Played by ' + escape(name(outgoingId)) + '<input name="outgoingRounds" type="number" min="0" max="' + plan.maxRounds + '" value="' + outgoingRounds + '" required></label><label>Sub Rounds<input name="subRounds" type="number" min="1" max="' + plan.maxRounds + '" value="' + Math.max(1, unused + outgoing.rounds - outgoingRounds) + '" required></label></div>' : '<p class="form-hint">Staff outside the pasted roster receive no participation credits. Choose Count or Report after adding them.</p>'}<p class="form-error" role="alert"></p><div class="toolbar"><button class="button secondary" type="button" data-close-reward-picker>Cancel</button><button class="button" type="submit">${outgoing ? "Add Sub" : "Add Staff"}</button></div></form>`;
    function options(query = "") {
      const selected = dialog.querySelector("[name=player]").value;
      const players = matchingCreditPlayers(state, query).filter(
        (p) => !plan.participants.some((r) => r.player === p.id),
      );
      dialog.querySelector("[name=player]").innerHTML =
        '<option value="">Choose a Player</option>' +
        players
          .map(
            (p) =>
              '<option value="' +
              escape(p.id) +
              '" ' +
              (p.id === selected ? "selected" : "") +
              ">" +
              escape(p.name) +
              " (" +
              escape(p.id) +
              ")</option>",
          )
          .join("");
    }
    function close() {
      dialog.remove();
      if (shell) shell.inert = false;
      previousFocus?.focus({ preventScroll: true });
    }
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-reward-picker]")) close();
    });
    dialog.addEventListener("input", (event) => {
      if (event.target.hasAttribute("data-reward-search"))
        options(event.target.value);
    });
    dialog.addEventListener("change", (event) => {
      if (event.target.name === "outgoingRounds")
        dialog.querySelector("[name=subRounds]").value = Math.max(
          1,
          unused + outgoing.rounds - Number(event.target.value),
        );
    });
    dialog.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const candidate = structuredClone(plan),
          player = dialog.querySelector("[name=player]").value;
        if (!people.has(player))
          throw Error("Choose a player from the full player pool.");
        if (outgoing)
          candidate.participants.find((r) => r.player === outgoingId).rounds =
            Number(dialog.querySelector("[name=outgoingRounds]").value);
        candidate.participants.push({
          player,
          rounds: outgoing
            ? Number(dialog.querySelector("[name=subRounds]").value)
            : 0,
          count: !outgoing,
          report: false,
          ...(outgoing ? { replaces: rootId } : { staffOnly: true }),
        });
        tourRewardQuote(preview.players, candidate);
        plan = candidate;
        close();
        draw();
      } catch (error) {
        dialog.querySelector("[role=alert]").textContent = error.message;
      }
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll("input,select,button")],
          first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    options();
    document.body.append(dialog);
    if (shell) shell.inert = true;
    dialog.querySelector("[data-reward-search]").focus();
  }
  draw();
  return {
    payload() {
      collect();
      tourRewardQuote(preview.players, plan);
      return {
        ...plan,
        ...meta,
        expectedPlayers: preview.players.map((p) => p.id),
      };
    },
  };
}
