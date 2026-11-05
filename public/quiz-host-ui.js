import { validQuizAudio } from "./quiz-rules.js";
function quizResetPanel(q, e) {
  return q
    ? `<form id="quiz-scores-reset" class="stack space-top"><input type="hidden" name="quiz" value="${e(q.id)}"><input type="hidden" name="quizName" value="${e(q.name)}"><p class="form-hint">Reset this quiz’s leaderboard, personal bests, active runs and completion titles. Existing credits stay, and previously claimed rewards remain protected.</p><button type="submit" class="button danger">Reset Scores & Completion Titles</button></form>`
    : "";
}
export function quizHostPanel(quizzes, e, selected = null, pool = null) {
  const q = quizzes.find((q) => q.id === selected);
  return `<section class="host-panel"><h2>Quiz Pools</h2><p>Upload an AnisongDB or AMQ song export. AMQ MP3 videoUrl links are used when supplied; missing audio is resolved by song ID. Audio links are checked before saving, and broken links can be replaced or skipped. Answers are matched to AMQ's master list. Existing personal bests and one-time rewards remain when the pool is updated.</p><div class="quiz-pool-picker"><label for="host-quiz-select">Quiz<select id="host-quiz-select"><option value="" ${q ? "" : "selected"}>New Quiz</option>${quizzes.map((item) => `<option value="${e(item.id)}" ${item.id === selected ? "selected" : ""}>${e(item.name)} · ${item.published ? "Published" : "Draft"}</option>`).join("")}</select></label><button type="button" class="button secondary" data-new-quiz>New Quiz ＋</button></div><form id="quiz-save" class="stack space-top" data-pool-loading="${!!q && pool?.id !== q.id}"><input name="id" type="hidden" value="${e(q?.id || "")}"><label>Category<select name="category"><option value="singers" ${q?.category !== "composers" ? "selected" : ""}>Singers</option><option value="composers" ${q?.category === "composers" ? "selected" : ""}>Composers</option></select></label><label>Quiz Name<input name="name" maxlength="100" required value="${e(q?.name || "")}"></label><label>100% Completion Title<input name="title" maxlength="80" value="${e(q?.title || "")}" placeholder="Optional achievement title"></label><label>Cover Image<input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp"></label>${q?.cover ? `<img class="quiz-cover-preview" src="${e(q.cover)}" alt="Current Quiz Cover">` : ""}${q ? `<div id="quiz-current-pool">${pool?.id === q.id ? quizPoolEditor(pool, e) : '<p role="status">Loading Current Song Pool…</p>'}</div><label>JSON Import Mode<select name="songMode"><option value="replace">Replace Pool</option><option value="append">Add Songs to Current Pool</option></select></label>` : ""}<label>AnisongDB / AMQ Song JSON<input name="songsFile" type="file" accept=".json,application/json" ${q ? "" : "required"}></label><p class="form-hint">Up to 2,000 songs. Use Replace Pool or Add Songs for a JSON import. Leave the file blank to keep the pool with any checked removals. A published quiz needs at least 20 matched songs.</p><div data-quiz-song-review aria-live="polite"></div><label>Status<select name="published"><option value="false" ${!q?.published ? "selected" : ""}>Draft · Hidden From Players</option><option value="true" ${q?.published ? "selected" : ""}>Published</option></select></label><button class="button" type="submit" ${q && pool?.id !== q.id ? "disabled" : ""}>Save Quiz →</button></form>${quizResetPanel(q, e)}</section>`;
}
export async function quizHostBody(form) {
  const fields = Object.fromEntries(new FormData(form)),
    body = {
      id: fields.id || undefined,
      name: fields.name,
      category: fields.category || "singers",
      title: fields.title,
      published: fields.published === "true",
      ...(fields.expectedUpdated
        ? { expectedUpdated: Number(fields.expectedUpdated) }
        : {}),
      ...(fields.songMode ? { songMode: fields.songMode } : {}),
      removeSongIds: new FormData(form).getAll("removeSongIds").map(Number),
    };
  const songs = form.elements.songsFile.files[0],
    cover = form.elements.coverFile.files[0];
  if (songs) {
    if (songs.size > 4500000) throw Error("Use a song JSON under 4.5 MB.");
    const reviewed = fileReviews.get(form.elements.songsFile);
    if (
      !reviewed ||
      reviewed.file !== songs ||
      !reviewed.current() ||
      reviewed.checking ||
      !reviewed.review?.songs.some((s) => !s.skipped) ||
      reviewed.review.songs.some((s) => !s.skipped && !s.link?.working)
    )
      throw Error(
        "Review the MP3 links before saving. Replace or skip broken songs.",
      );
    body.input = reviewed.input;
    body.audioOverrides = Object.fromEntries(
      reviewed.review.songs
        .filter((s) => !s.skipped && s.audio !== s.sourceAudio)
        .map((s) => [s.sourceAudio, s.audio]),
    );
    body.skipAudio = reviewed.review.songs
      .filter((s) => s.skipped)
      .map((s) => s.sourceAudio);
  }
  if (cover) {
    if (
      cover.size > 300000 ||
      !["image/png", "image/jpeg", "image/webp"].includes(cover.type)
    )
      throw Error("Use a PNG, JPEG or WebP cover under 300 KB.");
    body.cover = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error("Cover could not be read."));
      reader.readAsDataURL(cover);
    });
  }
  return body;
}

export async function readQuizJSON(file) {
  if (file.size > 4500000) throw Error("Use a song JSON under 4.5 MB.");
  try {
    return JSON.parse(await file.text());
  } catch {
    throw Error("The song file is not valid JSON.");
  }
}
export function quizSongReview(result, e) {
  const songs = result.songs || [],
    rejected = result.rejected || [];
  return (
    '<section class="quiz-import-review"><h3>Song Review</h3><p>' +
    songs.length +
    " Matched Songs · " +
    rejected.length +
    ' Skipped Rows</p><p class="form-hint">Review these imported songs, then save the quiz. Duplicate MP3s are included once.</p>' +
    (songs.length
      ? '<div class="table-wrap quiz-song-list" role="region" aria-label="Imported Songs" tabindex="0"><table><thead><tr><th>#</th><th>Song</th><th>Artist</th><th>Anime</th><th>Audio Link</th></tr></thead><tbody>' +
        songs
          .map(
            (song, i) =>
              "<tr><td>" +
              (i + 1) +
              "</td><td>" +
              e(song.title) +
              "</td><td>" +
              e(song.artist || "—") +
              '</td><td title="' +
              e((song.answers || []).join(" / ")) +
              '">' +
              e(song.answers?.[0] || "—") +
              "</td><td>" +
              audioReviewCell(song, i, e) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>"
      : '<p class="form-error">No playable MP3 songs matched AMQ.</p>') +
    (rejected.length
      ? '<details class="space-top"><summary>Skipped Rows (' +
        rejected.length +
        ')</summary><div class="quiz-song-list"><ul>' +
        rejected
          .map(
            (row) => "<li>Row " + e(row.row) + ": " + e(row.reason) + "</li>",
          )
          .join("") +
        "</ul></div></details>"
      : "") +
    "</section>"
  );
}
function audioReviewCell(song, index, e) {
  const attr = ' data-quiz-audio-index="' + index + '"';
  const button = (action, label) =>
    '<button type="button" class="button secondary" data-quiz-audio-action="' +
    action +
    '"' +
    attr +
    ">" +
    label +
    "</button>";
  if (song.skipped)
    return (
      '<span class="subtext">Skipped</span>' + button("restore", "Restore Song")
    );
  if (!song.link) return '<span class="subtext">Checking…</span>';
  if (song.link.working)
    return (
      '<span class="quiz-link-working">✓ Working MP3</span>' +
      (song.audio !== song.sourceAudio ? "<small>Replacement Link</small>" : "")
    );
  return (
    '<p class="form-error">' +
    e(song.link.message || "Broken MP3 link") +
    '</p><p class="form-hint">Register a working MP3 link?</p>' +
    (song.editing
      ? '<label>Replacement MP3<input type="url" data-quiz-replacement="' +
        index +
        '" placeholder="https://…/song.mp3" value="' +
        e(song.replacement || "") +
        '"></label>' +
        button("check", "Check Replacement")
      : button("replace", "Use Another MP3")) +
    button("retry", "Retry Link") +
    button("skip", "Skip Song")
  );
}
const fileReviews = new WeakMap();
function syncAudioReview(token, e) {
  if (!token.current()) return;
  const songs = token.review?.songs || [],
    active = songs.filter((s) => !s.skipped),
    bad = active.filter((s) => !s.link?.working);
  token.output.innerHTML =
    quizSongReview(token.review, e) +
    (token.checking
      ? '<p role="status">Checking MP3 Links · ' +
        (token.checked || 0) +
        " / " +
        active.length +
        "</p>"
      : bad.length
        ? '<p class="form-error">' +
          bad.length +
          " link(s) need attention. Replace or skip them before saving.</p>"
        : "");
  if (!token.checking && active.length)
    token.output.innerHTML +=
      '<button type="button" class="button secondary" data-quiz-audio-action="recheck">Recheck Audio Links</button>';
  token.element.setCustomValidity(
    token.checking
      ? "Checking MP3 links."
      : !active.length
        ? "No playable MP3 songs matched AMQ."
        : bad.length
          ? "Replace or skip broken MP3 links before saving."
          : "",
  );
  token.submit.disabled =
    token.checking || token.form.dataset?.poolLoading === "true";
}
async function checkReviewLinks(token, indices, call, e, force = false) {
  token.checking = true;
  token.checked = 0;
  syncAudioReview(token, e);
  try {
    for (let offset = 0; offset < indices.length; offset += 8) {
      const positions = indices.slice(offset, offset + 8);
      const batch = positions.map((i) => ({
        audio: token.review.songs[i].audio,
        alternatives: token.review.songs[i].alternatives || [],
      }));
      const result = await call("quiz-audio-check", { songs: batch, force });
      if (!token.current()) return;
      if (
        !Array.isArray(result.checks) ||
        result.checks.length !== batch.length
      )
        throw Error(
          "Audio validation returned an incomplete result. Retry Song Review.",
        );
      for (let n = 0; n < positions.length; n++) {
        const song = token.review.songs[positions[n]],
          check = result.checks[n];
        if (check.audio !== batch[n].audio)
          throw Error("Audio review changed. Retry Song Review.");
        song.link = check;
        if (check.working) song.audio = check.resolvedAudio || song.audio;
      }
      token.checked += positions.length;
      const progress = token.output.querySelector?.('[role="status"]');
      if (progress)
        progress.textContent =
          "Checking MP3 Links · " + token.checked + " / " + indices.length;
    }
  } finally {
    token.checking = false;
    if (token.current()) syncAudioReview(token, e);
  }
}
export async function previewQuizFile(input, call, e) {
  const form = input.form,
    file = input.files[0],
    output = form.querySelector("[data-quiz-song-review]"),
    submit = form.querySelector('button[type="submit"]');
  const token = { element: input, form, file, output, submit };
  fileReviews.set(input, token);
  token.current = () =>
    fileReviews.get(input) === token &&
    input.isConnected &&
    input.files[0] === file;
  input.setCustomValidity(file ? "Reviewing the selected song JSON." : "");
  output.innerHTML = file
    ? '<p role="status">Matching Songs for Review…</p>'
    : "";
  submit.disabled = !!file;
  if (!file) return;
  try {
    token.input = await readQuizJSON(file);
    if (!token.current()) return;
    const review = await call("quiz-preview", { input: token.input });
    if (!token.current()) return;
    token.review = {
      ...review,
      songs: (review.songs || []).map((s) => ({ ...s, sourceAudio: s.audio })),
    };
    await checkReviewLinks(
      token,
      token.review.songs.map((s, i) => i),
      call,
      e,
    );
  } catch (error) {
    if (!token.current()) return;
    input.setCustomValidity(
      "Review the song JSON and audio links before saving.",
    );
    output.innerHTML =
      '<p class="form-error" role="alert">' +
      e(error.message) +
      '</p><button type="button" class="button secondary" data-quiz-review-retry>Retry Song Review</button>';
  } finally {
    if (token.current()) submit.disabled = form.dataset?.poolLoading === "true";
  }
}
export async function handleQuizAudioReview(event, call, e) {
  const button = event.target.closest("[data-quiz-audio-action]");
  if (!button) return false;
  const form = button.closest("form"),
    input = form?.elements.songsFile,
    token = input && fileReviews.get(input);
  if (!token?.current() || token.checking) return true;
  if (button.dataset.quizAudioAction === "recheck") {
    await checkReviewLinks(
      token,
      token.review.songs
        .map((s, i) => (s.skipped ? null : i))
        .filter((i) => i !== null),
      call,
      e,
    );
    return true;
  }
  const index = Number(button.dataset.quizAudioIndex),
    song = token.review.songs[index],
    action = button.dataset.quizAudioAction;
  if (!song) return true;
  if (action === "skip" || action === "restore") {
    song.skipped = action === "skip";
    syncAudioReview(token, e);
    return true;
  }
  if (action === "replace") {
    song.editing = true;
    syncAudioReview(token, e);
    token.output
      .querySelector('[data-quiz-replacement="' + index + '"]')
      ?.focus();
    return true;
  }
  if (action === "check") {
    const replacement =
      token.output.querySelector('[data-quiz-replacement="' + index + '"]')
        ?.value || "";
    song.replacement = replacement;
    if (!validQuizAudio(replacement)) {
      song.link = { working: false, message: "Use a complete HTTPS MP3 link." };
      syncAudioReview(token, e);
      return true;
    }
    song.audio = validQuizAudio(replacement);
    song.alternatives = [];
  }
  if (action === "check" || action === "retry")
    await checkReviewLinks(token, [index], call, e, true);
  return true;
}

export function quizPoolEditor(pool, e) {
  return (
    '<input type="hidden" name="expectedUpdated" value="' +
    pool.updated +
    '"><details class="quiz-pool-editor" open><summary>Current Song Pool · ' +
    pool.songs.length +
    ' Songs</summary><p class="form-hint">Check songs to remove, then Save Quiz. Uncheck to undo. A published quiz needs at least 20 songs.</p><div class="table-wrap quiz-song-list"><table><thead><tr><th>Remove</th><th>Song</th><th>Artist</th><th>Anime</th></tr></thead><tbody>' +
    pool.songs
      .map(
        (song) =>
          '<tr><td><input type="checkbox" name="removeSongIds" value="' +
          song.id +
          '" aria-label="Remove ' +
          e(song.title) +
          '"></td><td>' +
          e(song.title) +
          "</td><td>" +
          e(song.artist || "—") +
          '</td><td title="' +
          e(song.answers.join(" / ")) +
          '">' +
          e(song.answers[0]) +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div></details>"
  );
}
