import test from "node:test";
import {quizNameMatches,quizNameWarningHTML,quizReviewWarnings,sortQuizReview} from '../public/quiz-review.js';
import assert from "node:assert/strict";
import {
  quizHostPanel,
  quizSongReview,
  readQuizJSON,
  previewQuizFile,
  handleQuizAudioReview,
} from "../public/quiz-host-ui.js";
const e = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const file = (input) => ({
  size: 100,
  text: async () => JSON.stringify(input),
});
function fixture(f) {
  const output = { innerHTML: "" },
    submit = { disabled: false };
  const input = {
    files: f ? [f] : [],
    isConnected: true,
    validity: "",
    setCustomValidity(v) {
      this.validity = v;
    },
  };
  input.form = {
    querySelector: (s) => (s === "[data-quiz-song-review]" ? output : submit),
  };
  return { input, output, submit };
}
test("host quiz selector keeps selection and status beside New Quiz without a button per pool", () => {
  const html = quizHostPanel(
    [
      { id: "a", name: "One <Quiz>", published: true },
      { id: "b", name: "Two", published: false },
    ],
    e,
    "b",
  );
  assert.match(html, /<select id="host-quiz-select">/);
  assert.match(html, /value="b" selected>Two · Draft/);
  assert.match(html, /One &lt;Quiz> · Published/);
  assert.match(html, /data-new-quiz>New Quiz/);
  assert.doesNotMatch(html, /data-edit-quiz/);
  assert.match(html, /data-quiz-song-review/);
});
test("song review escapes metadata and shows matched titles, artist, anime and skipped rows", () => {
  const html = quizSongReview(
    {
      songs: [
        { title: "<Song>", artist: "<Artist>", answers: ["<Anime>", "Alt"] },
      ],
      rejected: [{ row: 2, reason: "<Missing>" }],
    },
    e,
  );
  assert.match(html, /1 Matched Songs · 1 Skipped Rows/);
  for (const text of [
    "&lt;Song>",
    "&lt;Artist>",
    "&lt;Anime>",
    "Row 2: &lt;Missing>",
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<Song>|<Artist>|<Anime>|<Missing>/);
});

test('automod distinguishes repeated song titles from shared anime answers and sorts without changing source rows or audio actions',()=>{
  const quizzes=[{id:'a',name:'LiSA',published:true},{id:'b',name:'ＬｉＳＡ',category:'composers',published:false},{id:'c',name:'Other'}];
  assert.deepEqual(quizNameMatches(' lisa ',quizzes,'a').map(q=>q.id),['b']);
  assert.equal(quizNameMatches('',quizzes).length,0);
  assert.equal(quizNameMatches('Unique',quizzes).length,0);
  const warning=quizNameWarningHTML('lisa',quizzes,'',e);
  assert.match(warning,/Duplicate Quiz Name/);assert.match(warning,/Singers · Published/);assert.match(warning,/Composers · Draft/);
  assert.match(quizNameWarningHTML('<Quiz>',[{id:'x',name:'<Quiz>'}],'',e),/&lt;Quiz>/);
  assert.equal(quizNameWarningHTML('LiSA',quizzes.slice(0,1),'a',e),'');
  const songs=[{title:'Song 10',artist:'Beta',answers:['Same Anime'],link:{working:true},audio:'a'},
    {title:'Song 2',artist:'',answers:['Same Anime'],link:{working:false,message:'HTTP 404'},audio:'b'},
    {title:' song   2 ',artist:'Alpha',answers:['Other Anime'],link:{working:true},audio:'c'},
    {title:'Song 2',skipped:true,audio:'d'}];
  const issues=quizReviewWarnings(songs);assert.equal(issues.duplicates.length,1);assert.deepEqual(issues.broken,[1]);assert.deepEqual(issues.duplicates[0].rows.map(r=>r.index),[1,2]);
  assert.equal(quizReviewWarnings([{title:'Unique',audio:'a'}],[{title:'Unique',audio:'a'}]).duplicates.length,0,'append deduplicates identical audio');
  assert.equal(quizReviewWarnings([{title:'Unique'}],[{title:'unique',reviewIndex:9}]).duplicates[0].rows[1].index,9);
  const entries=songs.slice(0,3).map((song,index)=>({index,title:song.title,artist:song.artist}));
  assert.deepEqual(sortQuizReview(entries,{key:'title',ascending:true}).map(r=>r.index),[1,2,0]);
  assert.deepEqual(sortQuizReview(entries,{key:'artist',ascending:false}).map(r=>r.index),[0,2,1]);
  const html=quizSongReview({songs},e,{key:'title',ascending:true});
  assert.match(html,/1 broken or unverified link/);assert.match(html,/1 duplicate song title/);assert.match(html,/data-quiz-audio-index="1"/);
  assert.ok(html.indexOf('data-review-index="1"')<html.indexOf('data-review-index="0"'));assert.match(html,/aria-sort="ascending"/);
  assert.deepEqual(entries.map(r=>r.index),[0,1,2]);
});
test("file review blocks premature save, renders server matches and clears on removing the file", async () => {
  const f = fixture(file([{ annId: 1 }]));
  let resolve;
  const pending = previewQuizFile(
    f.input,
    async (path, b) => {
      if (path === "quiz-audio-check")
        return {
          checks: b.songs.map((s) => ({
            audio: s.audio,
            resolvedAudio: s.audio,
            working: true,
          })),
        };
      assert.equal(path, "quiz-preview");
      assert.equal(b.input[0].annId, 1);
      return new Promise((r) => (resolve = r));
    },
    e,
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(f.submit.disabled, true);
  assert.match(f.input.validity, /Reviewing/);
  resolve({
    songs: [
      { title: "A", audio: "https://example.com/a.mp3", answers: ["Anime"] },
    ],
    rejected: [],
  });
  await pending;
  assert.equal(f.submit.disabled, false);
  assert.equal(f.input.validity, "");
  assert.match(f.output.innerHTML, /Song Review/);
  f.input.files = [];
  await previewQuizFile(f.input, () => assert.fail("No request"), e);
  assert.equal(f.output.innerHTML, "");
  assert.equal(f.input.validity, "");
});
test("invalid files and lookup errors show retry, zero matches stay invalid, and stale review cannot replace a newer selection", async () => {
  await assert.rejects(readQuizJSON({ size: 4500001 }), /4.5 MB/);
  await assert.rejects(
    readQuizJSON({ size: 1, text: async () => "{" }),
    /valid JSON/,
  );
  const f = fixture(file([]));
  await previewQuizFile(
    f.input,
    async () => {
      throw Error("<Unavailable>");
    },
    e,
  );
  assert.match(f.output.innerHTML, /&lt;Unavailable>/);
  assert.match(f.output.innerHTML, /Retry Song Review/);
  assert.ok(f.input.validity);
  assert.equal(f.submit.disabled, false);
  await previewQuizFile(
    f.input,
    async () => ({ songs: [], rejected: [{ row: 1, reason: "No MP3" }] }),
    e,
  );
  assert.match(f.input.validity, /No playable/);
  let oldResolve;
  const old = previewQuizFile(
    f.input,
    async () => new Promise((r) => (oldResolve = r)),
    e,
  );
  await new Promise((r) => setImmediate(r));
  f.input.files = [file([{ annId: 2 }])];
  await previewQuizFile(
    f.input,
    async (path, b) =>
      path === "quiz-audio-check"
        ? {
            checks: b.songs.map((s) => ({
              audio: s.audio,
              resolvedAudio: s.audio,
              working: true,
            })),
          }
        : {
            songs: [
              {
                title: "New",
                audio: "https://example.com/new.mp3",
                answers: ["Anime"],
              },
            ],
          },
    e,
  );
  oldResolve({ songs: [{ title: "Old" }] });
  await old;
  assert.match(f.output.innerHTML, /New/);
  assert.doesNotMatch(f.output.innerHTML, /Old/);
  assert.equal(f.input.validity, "");
});

test("broken links prompt for a replacement or skip, and a checked working replacement unlocks save", async () => {
  const f = fixture(file([])),
    audio = "https://example.com/broken.mp3",
    replacement = "https://example.com/replacement.mp3";
  const call = async (path, b) =>
    path === "quiz-preview"
      ? {
          songs: [{ audio, title: "Broken Song", answers: ["Anime"] }],
          rejected: [],
        }
      : {
          checks: b.songs.map((s) => ({
            audio: s.audio,
            resolvedAudio: s.audio,
            working: s.audio === replacement,
            message: "HTTP 404",
          })),
        };
  await previewQuizFile(f.input, call, e);
  assert.match(f.input.validity, /Replace or skip/);
  assert.match(f.output.innerHTML, /Register a working MP3 link/);
  const replacementInput = { value: replacement, focus() {} };
  f.output.querySelector = () => replacementInput;
  f.input.form.elements = { songsFile: f.input };
  const action = (name) =>
    handleQuizAudioReview(
      {
        target: {
          closest: () => ({
            dataset: { quizAudioAction: name, quizAudioIndex: "0" },
            closest: () => f.input.form,
          }),
        },
      },
      call,
      e,
    );
  await action("replace");
  assert.match(f.output.innerHTML, /Replacement MP3/);
  await action("check");
  assert.equal(f.input.validity, "");
  assert.match(f.output.innerHTML, /Working MP3/);
  await action("recheck");
  assert.equal(f.input.validity, "");
  assert.match(f.output.innerHTML, /Replacement Link/);
  await action("skip");
  assert.match(f.input.validity, /No playable/);
  await action("restore");
  assert.equal(f.input.validity, "");
});

test("an old audio-check completion cannot replace a new file's review", async () => {
  const f = fixture(file([]));
  let finishOld;
  const old = previewQuizFile(
    f.input,
    async (path, b) =>
      path === "quiz-preview"
        ? {
            songs: [
              {
                title: "Old",
                audio: "https://example.com/old.mp3",
                answers: ["A"],
              },
            ],
          }
        : new Promise((resolve) => (finishOld = resolve)),
    e,
  );
  await new Promise((resolve) => setImmediate(resolve));
  f.input.files = [file([{}])];
  await previewQuizFile(
    f.input,
    async (path, b) =>
      path === "quiz-preview"
        ? {
            songs: [
              {
                title: "New File",
                audio: "https://example.com/new.mp3",
                answers: ["A"],
              },
            ],
          }
        : {
            checks: b.songs.map((s) => ({
              audio: s.audio,
              resolvedAudio: s.audio,
              working: true,
            })),
          },
    e,
  );
  finishOld({
    checks: [{ audio: "https://example.com/old.mp3", working: false }],
  });
  await old;
  assert.match(f.output.innerHTML, /New File/);
  assert.doesNotMatch(f.output.innerHTML, /Old/);
  assert.equal(f.input.validity, "");
});
