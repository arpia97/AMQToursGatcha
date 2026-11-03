function quizResetPanel(q, e) {
  return q
    ? `<form id="quiz-scores-reset" class="stack space-top"><input type="hidden" name="quiz" value="${e(q.id)}"><input type="hidden" name="quizName" value="${e(q.name)}"><p class="form-hint">Reset this quiz’s leaderboard, personal bests, active runs and completion titles. Existing credits stay, and previously claimed rewards remain protected.</p><button type="submit" class="button danger">Reset Scores & Completion Titles</button></form>`
    : "";
}
export function quizHostPanel(quizzes, e, selected = null) {
  const q = quizzes.find((q) => q.id === selected);
  return `<section class="host-panel"><h2>Quiz Pools</h2><p>Upload an AnisongDB or AMQ song export. AMQ exports without audio links are resolved automatically by song ID. MP3 links are matched to AMQ's master list; video links are ignored. Existing personal bests and one-time rewards remain when the pool is updated.</p><div class="quiz-pool-picker"><label for="host-quiz-select">Quiz<select id="host-quiz-select"><option value="" ${q ? "" : "selected"}>New Quiz</option>${quizzes.map((item) => `<option value="${e(item.id)}" ${item.id === selected ? "selected" : ""}>${e(item.name)} · ${item.published ? "Published" : "Draft"}</option>`).join("")}</select></label><button type="button" class="button secondary" data-new-quiz>New Quiz ＋</button></div><form id="quiz-save" class="stack space-top"><input name="id" type="hidden" value="${e(q?.id || "")}"><label>Quiz Name<input name="name" maxlength="100" required value="${e(q?.name || "")}"></label><label>100% Completion Title<input name="title" maxlength="80" value="${e(q?.title || "")}" placeholder="Optional achievement title"></label><label>Cover Image<input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp"></label>${q?.cover ? `<img class="quiz-cover-preview" src="${e(q.cover)}" alt="Current Quiz Cover">` : ""}<label>AnisongDB / AMQ Song JSON<input name="songsFile" type="file" accept=".json,application/json" ${q ? "" : "required"}></label><p class="form-hint">Up to 2,000 songs. Uploading a new JSON replaces the entire existing song pool. Leave blank to keep the current pool. A published quiz needs at least 20 matched songs.</p><div data-quiz-song-review aria-live="polite"></div><label>Status<select name="published"><option value="false" ${!q?.published ? "selected" : ""}>Draft · Hidden From Players</option><option value="true" ${q?.published ? "selected" : ""}>Published</option></select></label><button class="button" type="submit">Save Quiz →</button></form>${quizResetPanel(q, e)}</section>`;
}
export async function quizHostBody(form) {
  const fields = Object.fromEntries(new FormData(form)),
    body = {
      id: fields.id || undefined,
      name: fields.name,
      title: fields.title,
      published: fields.published === "true",
    };
  const songs = form.elements.songsFile.files[0],
    cover = form.elements.coverFile.files[0];
  if (songs) {
    if (songs.size > 4500000) throw Error("Use a song JSON under 4.5 MB.");
    body.input = await readQuizJSON(songs);
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
    ' Skipped Rows</p><p class="form-hint">Review this replacement pool, then save the quiz. Duplicate MP3s are included once.</p>' +
    (songs.length
      ? '<div class="table-wrap quiz-song-list" role="region" aria-label="Imported Songs" tabindex="0"><table><thead><tr><th>#</th><th>Song</th><th>Artist</th><th>Anime</th></tr></thead><tbody>' +
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
const fileReviews = new WeakMap();
export async function previewQuizFile(input, call, e) {
  const token = {},
    form = input.form,
    file = input.files[0],
    output = form.querySelector("[data-quiz-song-review]"),
    submit = form.querySelector('button[type="submit"]');
  fileReviews.set(input, token);
  const current = () =>
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
    const data = await readQuizJSON(file);
    if (!current()) return;
    const review = await call("quiz-preview", { input: data });
    if (!current()) return;
    output.innerHTML = quizSongReview(review, e);
    input.setCustomValidity(
      review.songs?.length ? "" : "No playable MP3 songs matched AMQ.",
    );
  } catch (error) {
    if (!current()) return;
    input.setCustomValidity("Review the song JSON before saving.");
    output.innerHTML =
      '<p class="form-error" role="alert">' +
      e(error.message) +
      '</p><button type="button" class="button secondary" data-quiz-review-retry>Retry Song Review</button>';
  } finally {
    if (current()) submit.disabled = false;
  }
}
