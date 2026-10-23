"""Read ACDB's published MySQL dumps as data. Never executes downloaded SQL."""
import argparse
import gzip
import hashlib
import html
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

BASE = 'https://www.animecharactersdatabase.com/'
EXPORTS = ('characters', 'publishers', 'assignments')
ANIME_TYPES = {2, 7, 8, 12}  # TV Anime, Movie, OVA, ONA in ACDB's published schema.
ROLES = {0:'Unsorted',1:'Extra',2:'Sub',5:'Supporting',7:'Main Character',8:'Deuteragonist',9:'Antagonist',10:'Protagonist'}

def clean(value):
    """Repair reversible UTF-8/cp1252 mojibake without changing valid Unicode."""
    s = str(value or '')
    for _ in range(2):
        try:
            raw = bytes(ord(c) if ord(c)<256 else c.encode('cp1252')[0] for c in s)
            repaired = raw.decode('utf8')
        except (UnicodeError, ValueError):
            break
        if repaired == s: break
        s = repaired
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', '', s)).split())

def build(cache, output, public):
    titles = {t['id']: t for t in records(cache/'publishers.sql.gz', 'publishers')}
    anime = {key for key,t in titles.items() if t['mt'] in ANIME_TYPES}
    assignments = {}
    for a in records(cache/'assignments.sql.gz', 'assignments'):
        if a['pid'] in anime: assignments.setdefault(a['cid'], set()).add(a['pid'])
    cards = []
    for c in records(cache/'characters.sql.gz', 'characters'):
        pids = assignments.get(c['id'], set())
        if c['publisher'] in anime: pids = pids | {c['publisher']}
        if not pids: continue
        pid = c['publisher'] if c['publisher'] in pids else min(pids)
        t = titles[pid]
        image = urljoin(BASE, str(c['image']).replace('\\','/'))
        if urlparse(image).hostname not in {'www.animecharactersdatabase.com','ami.animecharactersdatabase.com'}:
            raise ValueError('Unexpected image host')
        name = clean(c['romji']) or clean(c['japanese']) or f"Character {c['id']}"
        series = clean(t['english']) or clean(t['romjititle']) or f'Title {pid}'
        if len(name)>160 or len(series)>500: raise ValueError('Record exceeds catalog field limits')
        cards.append({'id':f"acdb-character-{c['id']}", 'kind':'character', 'name':name,
            'series':series, 'image':image, 'source':BASE+f"characters.php?id={c['id']}",
            'role':'main' if c['role'] in {7,10} else 'unknown' if c['role']==0 else 'supporting',
            'sourceRole':ROLES.get(c['role'],'Unsorted'), 'sourceTitleId':pid})
    cards.sort(key=lambda c:int(c['id'].split('-')[-1]))
    encoded = json.dumps(cards,ensure_ascii=False,separators=(',',':')).encode('utf8')
    version = hashlib.sha256(encoded).hexdigest()[:16]
    manifest = {'provider':'ACDB','version':version,'count':len(cards),
        'groups':{'main':sum(c['role']=='main' for c in cards),'other':sum(c['role']!='main' for c in cards)},
        'roles':dict(Counter(c['role'] for c in cards)),
        'generatedAt':datetime.now(timezone.utc).isoformat(), 'source':BASE+'databasedumps.php',
        'license':'https://opendatacommons.org/licenses/odbl/1-0/',
        'scope':'Characters linked to TV Anime, Movie, OVA or ONA. No sex filter. ACDB IDs retained; series variants may be separate cards.',
        'roleMapping':'Main Character and Protagonist → main; Unsorted → unknown; other listed roles → supporting. Unknown has weight 100.',
        'exports':{table:{'url':BASE+'hosted/'+table+'.sql.gz','sha256':hashlib.sha256((cache/(table+'.sql.gz')).read_bytes()).hexdigest()} for table in EXPORTS}}
    output.mkdir(parents=True,exist_ok=True)
    chunkdir = output/'chunks'; chunkdir.mkdir(exist_ok=True)
    chunks = []
    def save(section, bucket, payload):
        name=f'{section}-{bucket:04d}.json'
        (chunkdir/name).write_text(json.dumps({'version':version,'section':section,'bucket':bucket,'payload':payload},ensure_ascii=False,separators=(',',':')),encoding='utf8')
        chunks.append(name)
    buckets={}
    for c in cards: buckets.setdefault(int(c['id'].split('-')[-1])//500,{})[c['id']]=c
    for bucket,payload in sorted(buckets.items()): save('cards',bucket,payload)
    for section in ['main','other']:
        ids=[c['id'] for c in cards if (c['role']=='main')==(section=='main')]
        for start in range(0,len(ids),500): save(section,start//500,ids[start:start+500])
    ordered=sorted(cards,key=lambda c:(c['name'].lower(),c['id']))
    for start in range(0,len(ordered),500): save('browse',start//500,ordered[start:start+500])
    (output/'bundle.json').write_text(json.dumps({'manifest':manifest,'chunks':chunks},ensure_ascii=False,indent=2),encoding='utf8')
    public.mkdir(parents=True,exist_ok=True)
    (public/'acdb-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    # The adapted database is openly downloadable; no player or wallet data is included.
    (public/'acdb-catalog.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
    return {'manifest':manifest,'chunks':len(chunks),'downloadBytes':(public/'acdb-catalog.json.gz').stat().st_size}

def values(data):
    """Parse only INSERT tuple literals, with MySQL backslash and quote escaping."""
    i, size = 0, len(data)
    escapes = {'0':'\0', 'b':'\b', 'n':'\n', 'r':'\r', 't':'\t', 'Z':'\x1a'}
    while i < size:
        while i < size and data[i] in ' \t\r\n,;': i += 1
        if i == size: return
        if data[i] != '(': raise ValueError('Expected a tuple')
        i += 1
        row = []
        while True:
            while i < size and data[i].isspace(): i += 1
            if i == size: raise ValueError('Unterminated tuple')
            if data[i] == "'":
                i += 1
                out = []
                while i < size:
                    ch = data[i]; i += 1
                    if ch == '\\':
                        if i == size: raise ValueError('Unterminated escape')
                        ch = data[i]; i += 1; out.append(escapes.get(ch, ch))
                    elif ch == "'":
                        if i < size and data[i] == "'": out.append("'"); i += 1
                        else: break
                    else: out.append(ch)
                else: raise ValueError('Unterminated string')
                value = ''.join(out)
            else:
                start = i
                while i < size and data[i] not in ',)': i += 1
                token = data[start:i].strip()
                if token == 'NULL': value = None
                elif re.fullmatch(r'-?\d+', token): value = int(token)
                else: raise ValueError('Unsupported SQL literal')
            row.append(value)
            while i < size and data[i].isspace(): i += 1
            if i == size: raise ValueError('Unterminated tuple')
            if data[i] == ')': i += 1; yield row; break
            if data[i] != ',': raise ValueError('Expected a field separator')
            i += 1

def records(path, table):
    columns, in_schema = [], False
    with gzip.open(path, 'rt', encoding='utf8') as stream:
        for line in stream:
            if line.startswith(f'CREATE TABLE `{table}`'): in_schema = True; continue
            if in_schema:
                match = re.match(r'\s+`([^`]+)`\s+', line)
                if match: columns.append(match.group(1))
                elif line.startswith(')'): in_schema = False
            match = re.match(r'INSERT INTO `([^`]+)` VALUES (.*);\s*$', line)
            if not match: continue
            if match[1] != table: raise ValueError('Unexpected table in export')
            for row in values(match[2]):
                if len(row) != len(columns): raise ValueError(f'{table}: column count mismatch')
                yield dict(zip(columns, row))

def download(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for table in EXPORTS:
        dest = cache / (table + '.sql.gz')
        if dest.exists(): continue
        temp = dest.with_suffix('.gz.part')
        req = urllib.request.Request(BASE + 'hosted/' + dest.name, headers={'User-Agent':'AMQToursGatcha/0.1 (published database export)'})
        with urllib.request.urlopen(req, timeout=60) as response, temp.open('wb') as output:
            while chunk := response.read(1024 * 1024): output.write(chunk)
        # Verify gzip integrity before retaining a download.
        with gzip.open(temp, 'rb') as verify:
            while verify.read(1024 * 1024): pass
        temp.replace(dest)

def inspect(cache):
    chars=list(records(cache/'characters.sql.gz','characters'))
    titles=list(records(cache/'publishers.sql.gz','publishers'))
    result={'characters':len(chars),'titles':len(titles),'roles':dict(Counter(c['role'] for c in chars)), 'media_types':dict(Counter(t['mt'] for t in titles)),
            'characters_sample':[{k:c[k] for k in ['id','romji','publisher','role','CV','image','clone','otherchar']} for c in chars[:5]],
            'title_types_sample':{str(mt):[{k:t[k] for k in ['id','english','romjititle','mt']} for t in titles if t['mt']==mt][:5] for mt in sorted(set(t['mt'] for t in titles))},
            'voice_samples':[c['CV'] for c in chars if c['CV']][:20]}
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--inspect',action='store_true')
    parser.add_argument('--out',type=Path,help='Build a resumable upload bundle here')
    parser.add_argument('--public',type=Path,default=Path('public/data'),help='Adapted database download directory')
    args=parser.parse_args()
    download(args.cache)
    if args.inspect: print(json.dumps(inspect(args.cache),ensure_ascii=False,indent=2))
    if args.out: print(json.dumps(build(args.cache,args.out,args.public),ensure_ascii=False,indent=2))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8')
    main()
