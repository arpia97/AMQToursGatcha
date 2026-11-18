"""Refresh the Play and Quiz import answer snapshot from the master tab."""
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / "public" / "quiz-library"
SOURCE = ("https://docs.google.com/spreadsheets/d/1jTGhznBd8UzLewk6LNpAdfn5mS7cQ5wS37uqTSxcews"
          "/export?format=csv&gid=0&range=AF2:AF")


def norm(value):
    return " ".join(unicodedata.normalize("NFKC", value or "").lower().split())


def media_key(value):
    url = urlsplit(value or "")
    if url.hostname in {f"{region}dist.animemusicquiz.com" for region in ("eu", "nae", "naw")}:
        if re.fullmatch(r"/[\w-]+\.(?:mp3|webm|mp4)", url.path, re.ASCII | re.I):
            return "f:" + url.path[1:]
    return None


def catalogue():
    files, metadata, occurrences = defaultdict(set), defaultdict(set), defaultdict(set)
    for path in ROOT.glob("[0-9]*.json"):
        for row in json.loads(path.read_text(encoding="utf-8")).values():
            key = "a:" + str(row["amqSongId"]) if row.get("amqSongId") else "n:" + str(row["annSongId"])
            occurrences[key].add("n:" + str(row["annSongId"]))
            if file := media_key(row.get("audio")):
                files[file].add(key)
                occurrences[key].add(file)
            metadata[(row["annId"], norm(row["title"]), norm(row["artist"]))].add(key)
    return files, metadata, occurrences


def build(records):
    files, metadata, occurrences = catalogue()
    parents, winners, descriptions = {}, {}, defaultdict(set)
    song_rows = []

    def root(key):
        parents.setdefault(key, key)
        while key != parents[key]:
            parents[key] = parents[parents[key]]
            key = parents[key]
        return key

    total = 0
    for cells in records:
        if not cells or not cells[0].strip():
            continue
        export = json.loads(cells[0])
        info = export["songInfo"]
        names = info["animeNames"]
        canonical = [names.get("romaji"), names.get("english")]
        alternatives = info.get("allAlternativeAnswers")
        if alternatives is None:
            alternatives = [*info.get("altAnimeNames", []), *info.get("altAnimeNamesAnswers", [])]
        titles = {}
        for title in [*canonical, *alternatives]:
            if isinstance(title, str) and title.strip():
                titles.setdefault(norm(title), title.strip())
        if not titles:
            raise ValueError(f"No accepted titles in export {total + 1}")
        score = len(set(titles).difference(norm(title) for title in canonical))
        links = export.get("songLinks") or {}
        keys = {key for link in [links.get("primary"), links.get("playedSrc"), *links.get("allLinks", [])]
                if (key := media_key(link))}
        ids = info.get("siteIds") or {}
        song_rows.append([info.get("songName"), info.get("artist"), ids.get("annId"), info.get("type")])
        for field, prefix in (("amqSongId", "a:"), ("annSongId", "n:")):
            value = export.get(field) or info.get(field) or ids.get(field)
            if str(value).isdigit() and int(value) > 0:
                keys.add(prefix + str(int(value)))
        groups = {group for key in keys for group in files.get(key, ())}
        if not groups:
            candidates = metadata.get((ids.get("annId"), norm(info.get("songName")), norm(info.get("artist"))), set())
            if len(candidates) == 1:
                groups = candidates
        record = (score, total, tuple(titles.values()))
        all_keys = keys | groups
        song, artist = norm(info.get("songName")), norm(info.get("artist"))
        if not all_keys and ids.get("annId") and song and artist:
            # Temporary playback URLs cannot identify a recording across exports.
            all_keys.add("local:" + json.dumps([ids["annId"], song, artist, info.get("type"), info.get("typeNumber")]))
        for group in groups:
            all_keys.update(occurrences[group])
        if all_keys:
            # Mirror files and catalogue IDs for one recording must return the
            # same winning export, including when a quiz supplies only a URL.
            roots = sorted({root(key) for key in all_keys})
            first = roots[0]
            for other in roots:
                parents[other] = first
                prior = winners.pop(other, None)
                if prior and (prior[0], -prior[1]) > (record[0], -record[1]):
                    record = prior
            winners[first] = record
            if song and artist:
                descriptions[(ids.get("annId"), song, artist)].add(first)
        total += 1
    if not winners:
        raise ValueError("No master songs could be identified")
    # One export can have a temporary link even when another export of the
    # same anime, song and artist has a stable recording identity.
    for description, group in descriptions.items():
        known = {root(key) for key in group if not root(key).startswith("local:")}
        if len(known) != 1 or metadata.get(description, set()).difference(parents):
            continue
        target = known.pop()
        for key in group:
            orphan = root(key)
            if orphan.startswith("local:"):
                parents[orphan] = target
                candidate = winners.pop(orphan)
                winners[target] = max(winners[target], candidate, key=lambda row: (row[0], -row[1]))
    # Reuse records across media mirrors and IDs. Ties retain sheet order.
    chosen = sorted(set(winners.values()), key=lambda row: row[1])
    index = {row: i for i, row in enumerate(chosen)}
    exact = {key: index[winners[root(key)]] for key in sorted(parents) if not key.startswith("local:")}
    # Only use descriptive matches if every known recording with those
    # identifiers resolves to the same song, including unmatched AMQ+ entries.
    by_name = defaultdict(set)
    for (ann, song, artist), groups in metadata.items():
        by_name[(song, artist)].update(groups)
    for (_, song, artist), groups in descriptions.items():
        by_name[(song, artist)].update(groups)
    for (song, artist), groups in by_name.items():
        matches = {root(key) if key in parents else None for key in groups}
        if len(matches) == 1 and None not in matches:
            exact[f"m:\t{song}\t{artist}"] = index[winners[matches.pop()]]
    for (ann, song, artist), groups in descriptions.items():
        if not ann or f"m:\t{song}\t{artist}" in exact:
            continue
        matches = {root(key) if key in parents else None for key in groups | metadata.get((ann, song, artist), set())}
        if len(matches) == 1 and None not in matches:
            exact[f"m:{ann}\t{song}\t{artist}"] = index[winners[matches.pop()]]
    recordings = [[*song_rows[row], None] for _, row, _ in chosen]
    for key, idx in sorted(exact.items()):
        if key.startswith("f:") and key.lower().endswith(".mp3") and not recordings[idx][-1]:
            recordings[idx][-1] = key[2:]

    # Official AMQ song links provide occurrence IDs and categories, but no audio.
    # Bind unambiguous links to sheet recordings and retain missing AMQ+ entries
    # so a quiz with audio can supply the missing media for an AMQ-only song.
    amq = json.loads((ROOT.parent / "quiz-amq-master.json").read_text(encoding="utf-8"))
    official = []
    official_keys = defaultdict(set)
    for ann, anime in amq["animeMap"].items():
        names = list(dict.fromkeys(filter(None, [*(anime.get("mainNames") or {}).values(),
                          *(n.get("name") for n in anime.get("names", []))])))
        for kind, links in anime.get("songLinks", {}).items():
            for link in links:
                song_id, ann_song = link.get("songId"), link.get("annSongId")
                song = amq["songMap"].get(str(song_id), {})
                title, artist = song.get("name"), song.get("artist")
                if not title or not artist:
                    continue
                scoped = f"m:{ann}\t{norm(title)}\t{norm(artist)}"
                idx = exact.get(scoped, exact.get(f"m:\t{norm(title)}\t{norm(artist)}"))
                if idx is not None and recordings[idx][2] == int(ann):
                    if ann_song:
                        official_keys["n:" + str(ann_song)].add(idx)
                    if song_id:
                        official_keys["a:" + str(song_id)].add(idx)
                if "a:" + str(song_id) not in occurrences:
                    official.append([song_id, ann_song, int(ann), "Insert" if kind == "INS" else kind, title, artist, names])
    for key, matches in official_keys.items():
        if len(matches) == 1:
            exact.setdefault(key, next(iter(matches)))
    return {"sourceRows": total, "records": [[score, *titles] for score, _, titles in chosen],
            "recordings": recordings, "official": official, "keys": dict(sorted(exact.items()))}


if __name__ == "__main__":
    csv.field_size_limit(1_000_000)
    with urlopen(SOURCE, timeout=120) as response:
        data = build(csv.reader(io.TextIOWrapper(response, encoding="utf-8-sig", newline="")))
    encode = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    data["version"] = "master-" + hashlib.sha256(encode(data)).hexdigest()[:16]
    dest = ROOT / "master-answers.json"
    temp = dest.with_suffix(".tmp")
    temp.write_bytes(encode(data) + b"\n")
    temp.replace(dest)
    print(f"{data['sourceRows']:,} exports; {len(data['keys']):,} lookup keys; {data['version']}")
