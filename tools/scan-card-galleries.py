"""Build the initial card gallery counts. Pass a local checkpoint directory to start or resume."""
import argparse
import json
import re
import sqlite3
import threading
import time
from concurrent.futures import FIRST_EXCEPTION, ThreadPoolExecutor, wait
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ID = re.compile(r'mal-(character|person)-([1-9]\d*)$')
OUTPUT = Path(__file__).resolve().parents[1] / 'public' / 'gallery-counts'


def fetch(url, gallery=False):
    delay = 5
    while True:
        try:
            request = Request(url, headers={'Accept':'application/json','User-Agent':'AMQToursGatcha/GalleryIndex'})
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            if gallery and error.code == 404 and json.load(error).get('type') == 'ResourceNotFoundException':
                return {'data':[]}
            if error.code not in (408,429,500,502,503,504):
                raise
            retry = error.headers.get('Retry-After','')
            time.sleep(max(delay, int(retry) if retry.isdigit() else 0))
        except (URLError,TimeoutError,ConnectionError):
            time.sleep(delay)
        delay = min(delay * 2,120)


def discover(path, stop):
    with sqlite3.connect(path, timeout=60) as db:
        while not stop.is_set():
            pages = db.execute('SELECT kind,page FROM pages WHERE done=0 ORDER BY page,kind').fetchall()
            if not pages:
                return
            for kind,page in pages:
                result = fetch(f'https://amqtours.app/gacha/api/catalog?kind={kind}&page={page}')
                if result.get('page') != page or not isinstance(result.get('cards'),list):
                    raise ValueError('Invalid catalogue page')
                with db:
                    for card in result['cards']:
                        if ID.fullmatch(card['id']):
                            db.execute('INSERT OR IGNORE INTO cards(id,primary_url) VALUES(?,?)',(card['id'],card.get('image') or ''))
                    db.execute('UPDATE pages SET page=?,done=?,total=? WHERE kind=?',
                               (page+1,int(not result['hasMore']),result.get('total'),kind))
                time.sleep(1)


def export(db,shard):
    rows = db.execute('SELECT id,original,alternatives FROM cards WHERE shard=?',(shard,))
    counts = {card.split('-')[-1]:[original,count] for card,original,count in rows}
    OUTPUT.mkdir(exist_ok=True)
    path = OUTPUT / (shard+'.json')
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(counts,separators=(',',':')),encoding='utf-8')
    temporary.replace(path)


def scan(path, stop):
    with sqlite3.connect(path,timeout=60) as db:
        while not stop.is_set():
            row = db.execute('SELECT id,primary_url FROM cards WHERE alternatives IS NULL ORDER BY rowid LIMIT 1').fetchone()
            if not row:
                if not db.execute('SELECT 1 FROM pages WHERE done=0 LIMIT 1').fetchone():
                    return
                time.sleep(1)
                continue
            card,primary = row
            kind,num = ID.fullmatch(card).groups()
            endpoint = 'characters' if kind=='character' else 'people'
            directory = 'characters' if kind=='character' else 'voiceactors'
            pattern = re.compile(r'https://cdn\.myanimelist\.net/images/'+directory+r'/(\d+/\d+)\.(?:jpe?g|webp|png)$',re.I)
            start = time.monotonic()
            data = fetch(f'https://api.tenrai.org/v1/{endpoint}/{num}/pictures',True)['data']
            if not isinstance(data,list):
                raise ValueError('Invalid picture list')
            pictures = set()
            for pic in data:
                for fmt in ('jpg','webp'):
                    image = pattern.fullmatch(pic.get(fmt,{}).get('image_url') or '')
                    if image:
                        pictures.add(image[1])
                        break
            original = pattern.fullmatch(primary)
            key = original[1] if original else ''
            shard = f'{kind}-{int(num)//4096}'
            with db:
                db.execute('UPDATE cards SET alternatives=?,shard=?,original=? WHERE id=?',(len(pictures-{key}),shard,key,card))
            export(db,shard)
            time.sleep(max(0,.58-(time.monotonic()-start)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint',type=Path)
    checkpoint = parser.parse_args().checkpoint
    checkpoint.mkdir(parents=True,exist_ok=True)
    path = checkpoint/'gallery.sqlite'
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript("""
        CREATE TABLE IF NOT EXISTS pages(kind TEXT PRIMARY KEY,page INTEGER NOT NULL,done INTEGER NOT NULL,total INTEGER);
        CREATE TABLE IF NOT EXISTS cards(id TEXT UNIQUE NOT NULL,primary_url TEXT NOT NULL,alternatives INTEGER,shard TEXT,original TEXT);
        CREATE INDEX IF NOT EXISTS pending ON cards(alternatives);
        CREATE INDEX IF NOT EXISTS by_shard ON cards(shard);
        """)
        db.executemany('INSERT OR IGNORE INTO pages VALUES(?,1,0,NULL)',[('character',),('seiyuu',)])
        for shard, in db.execute('SELECT DISTINCT shard FROM cards WHERE shard IS NOT NULL'):
            export(db,shard)
    stop = threading.Event()
    with ThreadPoolExecutor(2) as pool:
        tasks = [pool.submit(discover,path,stop),pool.submit(scan,path,stop)]
        finished,_ = wait(tasks,return_when=FIRST_EXCEPTION)
        stop.set()
        for task in finished:
            task.result()
