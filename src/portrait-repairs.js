import { isSourcePortrait, sourcePortrait } from "../public/mal-portraits.js";

export const PORTRAIT_REPAIRS_ID = "portrait-repairs-2026-11-16-v1";
const NOV19_REPAIRS_ID = "portrait-repairs-2026-11-19";
const NOV19_REPAIRS = [[
  "mal-character-2973",
  "https://cdn.myanimelist.net/images/characters/2/4006.jpg",
  "https://cdn.myanimelist.net/images/characters/10/649291.jpg",
]];

export const CHARACTER_PORTRAIT_REPAIRS = [
  [
    "mal-character-169032",
    "https://cdn.myanimelist.net/images/characters/4/401680.jpg",
    "https://cdn.myanimelist.net/images/characters/8/649430.jpg",
  ],
];

export const SEIYUU_PORTRAIT_REPAIRS = [
  [
    "mal-person-34209",
    "https://cdn.myanimelist.net/images/voiceactors/2/60856.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/93013.jpg",
  ],
  [
    "mal-person-96",
    "https://cdn.myanimelist.net/images/voiceactors/2/17561.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/93107.jpg",
  ],
  [
    "mal-person-37",
    "https://cdn.myanimelist.net/images/voiceactors/2/74518.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92911.jpg",
  ],
  [
    "mal-person-36479",
    "https://cdn.myanimelist.net/images/voiceactors/1/83624.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92772.jpg",
  ],
  [
    "mal-person-39938",
    "https://cdn.myanimelist.net/images/voiceactors/1/91403.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/93033.jpg",
  ],
  [
    "mal-person-568",
    "https://cdn.myanimelist.net/images/voiceactors/1/6940.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/93096.jpg",
  ],
  [
    "mal-person-20605",
    "https://cdn.myanimelist.net/images/voiceactors/2/23204.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92874.jpg",
  ],
  [
    "mal-person-210",
    "https://cdn.myanimelist.net/images/voiceactors/3/57858.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/93019.jpg",
  ],
  [
    "mal-person-54297",
    "https://cdn.myanimelist.net/images/voiceactors/3/65882.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/91997.jpg",
  ],
  [
    "mal-person-760",
    "https://cdn.myanimelist.net/images/voiceactors/1/24171.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92832.jpg",
  ],
  [
    "mal-person-7914",
    "https://cdn.myanimelist.net/images/voiceactors/3/54843.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92946.jpg",
  ],
  [
    "mal-person-12456",
    "https://cdn.myanimelist.net/images/voiceactors/1/12179.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92934.jpg",
  ],
  [
    "mal-person-1257",
    "https://cdn.myanimelist.net/images/voiceactors/3/18083.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/92782.jpg",
  ],
  [
    "mal-person-15477",
    "https://cdn.myanimelist.net/images/voiceactors/1/57451.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92942.jpg",
  ],
  [
    "mal-person-17713",
    "https://cdn.myanimelist.net/images/voiceactors/2/20277.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92378.jpg",
  ],
  [
    "mal-person-45590",
    "https://cdn.myanimelist.net/images/voiceactors/3/91443.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/93151.jpg",
  ],
  [
    "mal-person-5691",
    "https://cdn.myanimelist.net/images/voiceactors/1/9947.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92891.jpg",
  ],
  [
    "mal-person-57301",
    "https://cdn.myanimelist.net/images/voiceactors/1/83270.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/92930.jpg",
  ],
  [
    "mal-person-988",
    "https://cdn.myanimelist.net/images/voiceactors/3/32783.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/93021.jpg",
  ],
  [
    "mal-person-10124",
    "https://cdn.myanimelist.net/images/voiceactors/3/60750.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/93030.jpg",
  ],
  [
    "mal-person-12260",
    "https://cdn.myanimelist.net/images/voiceactors/1/11748.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/92859.jpg",
  ],
  [
    "mal-person-12536",
    "https://cdn.myanimelist.net/images/voiceactors/3/12334.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/93005.jpg",
  ],
  [
    "mal-person-16567",
    "https://cdn.myanimelist.net/images/voiceactors/2/19107.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/92573.jpg",
  ],
  [
    "mal-person-28505",
    "https://cdn.myanimelist.net/images/voiceactors/3/30067.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92478.jpg",
  ],
  [
    "mal-person-33029",
    "https://cdn.myanimelist.net/images/voiceactors/3/33863.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/93122.jpg",
  ],
  [
    "mal-person-36481",
    "https://cdn.myanimelist.net/images/voiceactors/2/38549.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92589.jpg",
  ],
  [
    "mal-person-40490",
    "https://cdn.myanimelist.net/images/voiceactors/3/43529.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/91831.jpg",
  ],
  [
    "mal-person-41540",
    "https://cdn.myanimelist.net/images/voiceactors/2/44719.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92893.jpg",
  ],
  [
    "mal-person-53260",
    "https://cdn.myanimelist.net/images/voiceactors/3/61691.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92988.jpg",
  ],
  [
    "mal-person-5598",
    "https://cdn.myanimelist.net/images/voiceactors/1/2301.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92577.jpg",
  ],
  [
    "mal-person-6314",
    "https://cdn.myanimelist.net/images/voiceactors/1/31219.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92963.jpg",
  ],
  [
    "mal-person-77475",
    "https://cdn.myanimelist.net/images/voiceactors/2/81810.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92870.jpg",
  ],
  [
    "mal-person-8004",
    "https://cdn.myanimelist.net/images/voiceactors/3/5286.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/1/92886.jpg",
  ],
  [
    "mal-person-80099",
    "https://cdn.myanimelist.net/images/voiceactors/1/89869.jpg",
    "https://s4.anilist.co/file/anilistcdn/staff/large/n181534-90BMfBqeejXY.png",
  ],
  [
    "mal-person-8029",
    "https://cdn.myanimelist.net/images/voiceactors/3/5327.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/93111.jpg",
  ],
  [
    "mal-person-87193",
    "https://cdn.myanimelist.net/images/voiceactors/2/86173.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92581.jpg",
  ],
  [
    "mal-person-9112",
    "https://cdn.myanimelist.net/images/voiceactors/1/6730.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/91874.jpg",
  ],
  [
    "mal-person-9795",
    "https://cdn.myanimelist.net/images/voiceactors/3/56472.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/3/92896.jpg",
  ],
  [
    "mal-person-9975",
    "https://cdn.myanimelist.net/images/voiceactors/3/7992.jpg",
    "https://cdn.myanimelist.net/images/voiceactors/2/92798.jpg",
  ],
];

export function applyPortraitRepairs(e) {
  let changed = false;
  for (const [key, repairs] of [
    [PORTRAIT_REPAIRS_ID, [...SEIYUU_PORTRAIT_REPAIRS, ...CHARACTER_PORTRAIT_REPAIRS]],
    [NOV19_REPAIRS_ID, NOV19_REPAIRS],
  ]) {
    if (e.one("SELECT value FROM catalog_meta WHERE key=?", key)) continue;
    e.tx(() => {
      const updated = savePortraitRepairs(e, repairs);
      e.run("INSERT INTO catalog_meta VALUES(?,?)", key, JSON.stringify({ at: e.now(), updated }));
      if (updated) changed = true;
    });
  }
  return changed;
}

// A host edit or a newer import can land while the network checks are running.
export function savePortraitRepairs(e, repairs) {
  let updated = 0;
  for (const [id, oldUrl, newUrl] of repairs) {
    const row = e.one("UPDATE catalog SET image=? WHERE id=? AND image IS ? RETURNING id", newUrl, id, oldUrl);
    const bucket = e.catalogStore.tenrai.bucket(id);
    const path = '$."' + id + '".image';
    const packed = bucket !== null && e.one(
      "UPDATE tenrai_characters SET payload=json_set(payload,?,?) WHERE bucket=? AND json_type(payload,?)='object' AND json_extract(payload,?) IS ? RETURNING bucket",
      path, newUrl, bucket, '$."' + id + '"', path, oldUrl,
    );
    if (row || packed) updated++;
  }
  if (updated) e.catalogStore.invalidate();
  return updated;
}

export async function findPortraitRepairs(e, kind, entries, pass = 0, probe = fetch) {
  if (!Array.isArray(entries) || entries.length > 100) return [];
  const latest = new Map();
  for (const entry of entries) {
    const url = sourcePortrait(kind, entry?.images);
    if (url && Number.isSafeInteger(entry.mal_id) && entry.mal_id > 0)
      latest.set((kind === "character" ? "mal-character-" : "mal-person-") + entry.mal_id, url);
  }
  if (!latest.size) return [];
  const changed = e.catalogStore.cards([...latest.keys()]).filter(
    c => (!c.image || isSourcePortrait(kind, c.image)) && c.image !== latest.get(c.id),
  );
  // Bound CDN traffic and stay inside the importer's lease. Only replace a
  // confirmed missing file with an available image. Healthy alternate art stays.
  const repairs = [];
  const offset = changed.length > 12 ? (pass * 12) % changed.length : 0;
  const candidates = changed.slice(offset).concat(changed.slice(0, offset)).slice(0, 12);
  for (let start = 0; start < candidates.length; start += 4) {
    await Promise.all(candidates.slice(start, start + 4).map(async c => {
      const head = url => probe(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(3000) });
      try {
        if (c.image) {
          const old = await head(c.image);
          if (old.status !== 404 && old.status !== 410) return;
        }
        const url = latest.get(c.id);
        const fresh = await head(url);
        if (fresh.ok && /^image\/(jpeg|png|webp)\b/i.test(fresh.headers.get("Content-Type") || ""))
          repairs.push([c.id, c.image ?? null, url]);
      } catch {
        // A transient CDN failure can be retried on the next catalogue pass.
      }
    }));
  }
  return repairs;
}
