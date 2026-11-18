import { createMahjongUI } from "./mahjong-ui.js";
import {
  MAHJONG_START,
  MAHJONG_RIICHI,
  MAHJONG_DISCARD,
  mahjongEntryFee,
} from "./mahjong-rules.js";
import { createPachinkoUI, savedPachinkoGame, rememberPachinkoGame } from "./pachinko-ui.js";
import { createHorseUI } from "./horse-ui.js";
import { gamblingHistoryModalHTML } from "./gambling-history-ui.js";
import { formIdentifier } from "./form-actions.js";

export function createArcadePage({
  ui, getState, api, auth, execute, loadDynamic, modal, refreshCurrent, render, escape, number, now,
}) {
  const $ = selector => document.querySelector(selector);
  ui.pachinkoGame = savedPachinkoGame();
  const mahjongUI = createMahjongUI({
    getState,
    escape,
    number,
    getHistory: () => ({
      open: ui.mahjongHistoryOpen,
      data: ui.mahjongHistoryData,
    }),
  });
  const horseUI = createHorseUI({
    getState,
    escape,
    number,
    now,
    onFinish: () => refreshCurrent(),
  });
  const pachinkoUI = createPachinkoUI({
    getState,
    escape,
    number,
    ui,
    mahjong: () => mahjongUI.render({ embedded: true }),
    horse: () => horseUI.render(),
    now,
    onFinish: () => refreshCurrent(),
  });

  async function openGamblingHistory(game = "all", page = 1) {
    if (!getState().me) {
      auth();
      return;
    }
    ui.gamblingHistory = {
      game,
      page,
      loading: true,
      data: ui.gamblingHistory?.game === game ? ui.gamblingHistory.data : null,
    };
    modal(
      gamblingHistoryModalHTML(ui.gamblingHistory.data, true, game, {
        escape,
        number,
      }),
      true,
      "gambling-history-dialog",
    );
    try {
      const data = await api(
        "gambling-history?game=" +
          encodeURIComponent(game === "all" ? "" : game) +
          "&page=" +
          page,
      );
      ui.gamblingHistory = {
        game,
        page,
        loading: false,
        data,
      };
      modal(
        gamblingHistoryModalHTML(data, false, game, { escape, number }),
        true,
        "gambling-history-dialog",
      );
    } catch (err) {
      ui.gamblingHistory.loading = false;
      modal(
        gamblingHistoryModalHTML(null, false, game, { escape, number }) +
          '<p class="form-error" role="alert">' +
          escape(err.message || "Failed to load history.") +
          "</p>",
        true,
        "gambling-history-dialog",
      );
    }
  }

  document.addEventListener("change", (ev) => {
    const form = ev.target.form;
    if (form?.id !== "horse-ticket-form") return;
    horseUI.change(Object.fromEntries(new FormData(form)));
    if (ev.target.name === "kind") render();
    else form.querySelector(".race-quote").innerHTML = horseUI.quote();
  });

  for (const event of ["input", "change"])
    document.addEventListener(event, (ev) => {
      const form = ev.target.closest("#roulette-form");
      if (form) ui.rouletteDraft = Object.fromEntries(new FormData(form));
    });

  async function click(a, t) {
    const state = getState();
    if (a === "pachinko-game") {
      if (!rememberPachinkoGame(t.dataset.game)) return true;
      ui.pachinkoGame = t.dataset.game;
      render();
      return true;
    }
    if (a === "roulette-refresh") {
      await refreshCurrent();
      return true;
    }
    if (a === "blackjack-hit" || a === "blackjack-stand") {
      if (!state.me) {
        auth();
        return true;
      }
      await execute(a, {
        game: Number(t.dataset.game),
        version: Number(t.dataset.version),
      });
      return true;
    }
    if (a === "climb-start" || a === "climb-choose") {
      if (!state.me) {
        auth();
        return true;
      }
      await execute(
        a,
        a === "climb-start"
          ? { previousGame: state.climb?.id ?? null }
          : {
              game: Number(t.dataset.game),
              version: Number(t.dataset.version),
              option: Number(t.dataset.option),
            },
      );
      return true;
    }
    if (a?.startsWith("horse-")) {
      if (!state.me) {
        auth();
        return true;
      }
      if (a === "horse-remove") {
        horseUI.remove(Number(t.dataset.index));
        render();
        return true;
      }
      if (a === "horse-refresh") {
        await refreshCurrent();
        return true;
      }
      if (a === "horse-prepare")
        await execute(a, { previousRace: state.horseRace?.id ?? null });
      if (a === "horse-start") await execute(a, horseUI.purchase());
      return true;
    }
    if (a === "gem-start" || a === "gem-facet") {
      if (!state.me) {
        auth();
        return true;
      }
      await execute(
        a,
        a === "gem-start"
          ? { previousGame: state.gem?.id ?? null }
          : {
              game: Number(t.dataset.game),
              version: Number(t.dataset.version),
              row: t.dataset.row,
            },
      );
      return true;
    }
    if (
      a === "gambling-history" ||
      a === "gambling-history-filter" ||
      a === "gambling-history-prev" ||
      a === "gambling-history-next"
    ) {
      let game = ui.gamblingHistory?.game || "all";
      let page = ui.gamblingHistory?.page || 1;
      if (a === "gambling-history" || a === "gambling-history-filter") {
        game = t.dataset.game || "all";
        page = 1;
      } else if (a === "gambling-history-prev") {
        page = Math.max(1, page - 1);
      } else if (a === "gambling-history-next") {
        page = page + 1;
      }
      await openGamblingHistory(game, page);
      return true;
    }
    if (a?.startsWith("mahjong-")) {
      if (!state.me) {
        auth();
        return true;
      }
      if (
        a === "mahjong-history" ||
        a === "mahjong-history-next" ||
        a === "mahjong-history-prev"
      ) {
        if (a === "mahjong-history") {
          ui.mahjongHistoryOpen = !ui.mahjongHistoryOpen;
          ui.mahjongHistoryPage = 1;
        } else
          ui.mahjongHistoryPage = Math.max(
            1,
            ui.mahjongHistoryPage + (a.endsWith("next") ? 1 : -1),
          );
        await loadDynamic();
        render();
        return true;
      }
      if (a === "mahjong-select") {
        const discard = mahjongUI.select(Number(t.dataset.index));
        if (discard) {
          await execute("mahjong-discard", discard);
          return true;
        }
        render();
        $(
          "[data-action=mahjong-select][data-index='" + t.dataset.index + "']",
        )?.focus();
        return true;
      }
      if (a === "mahjong-start") {
        modal(
          `<h2>Take Your Seat?</h2><p>Pay <strong>✦ ${number(MAHJONG_START)} credits</strong> for a new Mahjong hand. Your seat will be randomly assigned.</p><form id="mahjong-confirm" class="stack"><input type="hidden" name="action" value="mahjong-start"><input type="hidden" name="previousGame" value="${state.mahjong?.id ?? ""}"><div class="form-error" role="alert"></div><button class="button mint" type="submit">Start hand · ✦ ${number(MAHJONG_START)}</button></form>`,
        );
        return true;
      }
      const body = {
        game: Number(t.dataset.game),
        version: Number(t.dataset.version),
      };
      if (a === "mahjong-kan") {
        body.tile = Number(t.dataset.tile);
        await execute(a, body);
        return true;
      }
      if (a === "mahjong-riichi") {
        const index = Number(t.dataset.index);
        modal(
          `<h2>Declare ${state.mahjong.discards.length === 0 && !state.mahjong.melds?.length ? "Double Riichi" : "Riichi"}?</h2><p>Lock your hand, discard the selected tile and draw. Pay <strong>✦ ${number(MAHJONG_RIICHI)} Riichi stake + ✦ ${number(MAHJONG_DISCARD)} discard/draw fee</strong> (✦ ${number(MAHJONG_RIICHI + MAHJONG_DISCARD)} total). The stake returns on a winning tsumo. After declaring, only newly drawn tiles can be discarded.</p><form id="mahjong-confirm" class="stack"><input type="hidden" name="action" value="mahjong-riichi"><input type="hidden" name="game" value="${body.game}"><input type="hidden" name="version" value="${body.version}"><input type="hidden" name="index" value="${index}"><div class="form-error" role="alert"></div><button class="button mint" type="submit">Declare & draw · ✦ ${number(MAHJONG_RIICHI + MAHJONG_DISCARD)}</button></form>`,
        );
        return true;
      }
      if (a === "mahjong-end") {
        modal(
          `<h2>${state.mahjong.remaining ? "End This Hand?" : "Settle as a Draw Instead?"}</h2><p>${state.mahjong.remaining ? "Your " + number(state.mahjong.cost) + " credits spent will not be refunded. You can leave this page and return later instead." : "This forgoes the available tsumo payout. Tenpai returns only the " + number(mahjongEntryFee(state.mahjong)) + "-credit entry fee; discard costs remain spent."}</p><form id="mahjong-confirm" class="stack"><input type="hidden" name="action" value="mahjong-end"><input type="hidden" name="game" value="${body.game}"><input type="hidden" name="version" value="${body.version}"><div class="form-error" role="alert"></div><button class="button secondary" type="submit">${state.mahjong.remaining ? "End hand" : "Settle draw"}</button></form>`,
        );
        return true;
      }
      if (a === "mahjong-discard") body.index = Number(t.dataset.index);
      await execute(a, body);
      return true;
    }
    return false;
  }

  async function submit(f, b) {
    const state = getState();
    if (formIdentifier(f) === "blackjack-bet") {
      ui.blackjackStake = Number(b.stake);
      if (!state.me) {
        auth();
        return true;
      }
      await execute(
        "blackjack-start",
        { stake: Number(b.stake), previousGame: state.blackjack?.id ?? null },
        null,
        f,
      );
      return true;
    }
    if (formIdentifier(f) === "horse-ticket-form") {
      try {
        horseUI.add(b);
        render();
      } catch (err) {
        f.querySelector(".form-error").textContent = err.message;
      }
      return true;
    }
    if (formIdentifier(f) === "roulette-form") {
      if (!state.me) {
        auth();
        return true;
      }
      ui.rouletteDraft = { choice: b.choice, stake: b.stake };
      await execute(
        "roulette-start",
        {
          previousGame: state.roulette?.id ?? null,
          choice: b.choice,
          stake: Number(b.stake),
        },
        null,
        f,
      );
      return true;
    }
    if (formIdentifier(f) === "mahjong-confirm") {
      const { action } = b;
      const body =
        action === "mahjong-start"
          ? {
              previousGame: b.previousGame === "" ? null : Number(b.previousGame),
            }
          : {
              game: Number(b.game),
              version: Number(b.version),
              ...(action === "mahjong-riichi" ? { index: Number(b.index) } : {}),
            };
      await execute(action, body);
      return true;
    }
    return false;
  }

  return {
    click, submit, render: pachinkoUI.render,
    mount() { horseUI.mount(); pachinkoUI.mount(); },
  };
}
