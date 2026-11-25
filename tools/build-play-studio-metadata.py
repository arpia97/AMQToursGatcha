import argparse, csv, json, re
from pathlib import Path

# Compact occurrence metadata for the custom song selector. Keys are ANN IDs.
def build(official, sheets, mal, shards):
    anime, songs, dubs = {}, {}, []
    rankings = {int(r['anime_id']): r for r in csv.DictReader(mal)}
    for key, a in official['animeMap'].items():
        season = a.get('seasonId')
        fmt=a['category']['name']
        fmt={'Season':'TV','movie':'Movie','TV Special':'Special','special':'Special'}.get(fmt,fmt)
        anime[key] = [fmt, a['year']*4+season if a.get('year') and season in (0,1,2,3) else None, None, None, [], []]
        for kind, entries in a['songLinks'].items():
            for link in entries:
                sid = link.get('annSongId')
                if not sid: continue
                meta = official['songMap'].get(str(link.get('songId')), {})
                songs[str(sid)] = [kind.replace('INS','IN'), {1:'Instrumental',2:'Chanting',3:'Character',4:'Standard'}.get(meta.get('category')), bool(link.get('rebroadcast')),bool(link.get('dub')),None,meta.get('popularity')]
    def enrich(aid,mid,genres=(),tags=()):
        row=anime.setdefault(str(aid),[None,None,None,None,[],[]]); m=rankings.get(mid,{})
        for idx,key in [(2,'Score'),(3,'Popularity')]:
            try: row[idx]=float(m[key])
            except (KeyError,ValueError): pass
        row[4]=sorted(set(row[4])|set(genres or [])|set(m.get('Genres','').split(', '))-{''})
        row[5]=sorted(set(row[5])|set(tags or []))
    for p in shards.glob('[0-9]*.json'):
        for r in json.loads(p.read_text(encoding='utf8')).values():
            enrich(r['annId'],r.get('linkedIds',{}).get('myanimelist'))
            sid=str(r['annSongId'])
            row=songs.setdefault(sid,[next((v for k,v in [('open','OP'),('end','ED'),('insert','IN')] if k in str(r.get('type')).lower()),None),None,False,False,None,None])
            row[4]=r.get('difficulty')
            if row[3] and r.get('audio'): dubs.append(r)
    for cells in csv.reader(sheets):
        try: r=json.loads(cells[0])['songInfo']; aid=r['siteIds']['annId']
        except (KeyError,IndexError,ValueError,TypeError): continue
        enrich(aid,r['siteIds'].get('malId'),r.get('genre'),r.get('tags'))
        sid=str(r.get('annSongId'))
        if sid in songs and isinstance(r.get('songPopularity'),(int,float)):songs[sid][5]=r['songPopularity']
    return {'anime':anime,'songs':songs,'dubs':dubs}
if __name__=='__main__':
    p=argparse.ArgumentParser()
    for k in ['official','sheet_csv','mal_csv','shards','output']:p.add_argument(k,type=Path)
    a=p.parse_args()
    with a.sheet_csv.open(encoding='utf-8-sig') as sheet,a.mal_csv.open(encoding='utf-8-sig') as mal:
        data=build(json.loads(a.official.read_text(encoding='utf-8-sig')),sheet,mal,a.shards)
    a.output.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False),encoding='utf8')
