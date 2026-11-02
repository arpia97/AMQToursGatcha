export function quizHostPanel(quizzes, e, selected = null) {
  const q = quizzes.find((q) => q.id === selected);
  return `<section class="host-panel"><h2>Quiz Pools</h2><p>Upload a standard AnisongDB export. MP3 filenames and HTTPS MP3 links are matched to AMQ's master list; video links are ignored. Existing personal bests and one-time rewards remain when the pool is updated.</p><div class="toolbar">${quizzes.map((q) => `<button class="button secondary" data-edit-quiz="${e(q.id)}">${e(q.name)} · ${q.published ? "Published" : "Draft"}</button>`).join("")}<button class="text-button" data-new-quiz>New Quiz ＋</button></div><form id="quiz-save" class="stack space-top"><input name="id" type="hidden" value="${e(q?.id || "")}"><label>Quiz Name<input name="name" maxlength="100" required value="${e(q?.name || "")}"></label><label>100% Completion Title<input name="title" maxlength="80" value="${e(q?.title || "")}" placeholder="Optional achievement title"></label><label>Cover Image<input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp"></label>${q?.cover ? `<img class="quiz-cover-preview" src="${e(q.cover)}" alt="Current Quiz Cover">` : ""}<label>AnisongDB Song JSON<input name="songsFile" type="file" accept=".json,application/json" ${q ? "" : "required"}></label><p class="form-hint">Up to 2,000 songs. Upload a replacement JSON to add songs; leave blank to keep the current pool. A published quiz needs at least 20 matched songs.</p><label>Status<select name="published"><option value="false" ${!q?.published ? "selected" : ""}>Draft · Hidden From Players</option><option value="true" ${q?.published ? "selected" : ""}>Published</option></select></label><button class="button" type="submit">Save Quiz →</button></form></section>`;
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
    try {
      body.input = JSON.parse(await songs.text());
    } catch {
      throw Error("The song file is not valid JSON.");
    }
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
