import {tourRecord} from './game-record-format.js';

const base='https://amqtours.app/api/';
async function host(path) {
  const res=await fetch(base+path,{signal:AbortSignal.timeout(20000)});
  if(!res.ok) throw new Error('Host records returned '+res.status);
  return res.json();
}
export async function storeGame(db, record, revision=1) {
  const {songs,...header}=record;
  const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
  // Every write is conditional on the same revision. A late retry cannot undo an edit.
  const current='EXISTS(SELECT 1 FROM games WHERE id=? AND revision=?)';
  const ops=[stmt('INSERT INTO games VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,document=excluded.document WHERE excluded.revision>=games.revision',
    header.id,header.source,header.tourId,revision,JSON.stringify(header)),
    stmt('DELETE FROM game_players WHERE game_id=? AND '+current,header.id,header.id,revision),
    stmt('DELETE FROM game_songs WHERE game_id=? AND '+current,header.id,header.id,revision),
    stmt("INSERT INTO game_players SELECT ?,value->>'$.id',value->>'$.teamId' FROM json_each(?) WHERE "+current,
      header.id,JSON.stringify(header.players),header.id,revision)];
  for(let i=0;i<songs.length;i+=12)ops.push(stmt(
    "INSERT INTO game_songs SELECT ?,value->>'$.number',value FROM json_each(?) WHERE "+current,
    header.id,JSON.stringify(songs.slice(i,i+12)),header.id,revision));
  await db.batch(ops);
}
async function discover(db) {
  const cursor=await db.prepare("SELECT position FROM record_cursors WHERE source='tour'").first('position')||'';
  const {rows,hasMore}=await host('archive/record-index?after='+encodeURIComponent(cursor));
  const end=rows.at(-1)?.id||cursor;
  const inRange='id>? AND (?=0 OR id<=?) AND id NOT IN(SELECT value FROM json_each(?))';
  const args=[cursor,Number(hasMore),end,JSON.stringify(rows.map(r=>r.id))];
  const cursorGuard=" AND COALESCE((SELECT position FROM record_cursors WHERE source='tour'),'')=?";
  await db.batch([
    db.prepare('DELETE FROM games WHERE tour_id IN(SELECT id FROM tour_imports WHERE '+inRange+')'+cursorGuard).bind(...args,cursor),
    db.prepare('DELETE FROM tours WHERE id IN(SELECT id FROM tour_imports WHERE '+inRange+')'+cursorGuard).bind(...args,cursor),
    db.prepare('DELETE FROM tour_imports WHERE '+inRange+cursorGuard).bind(...args,cursor),
    db.prepare(`INSERT INTO tour_imports(id,revision) SELECT value->>'$.id',value->>'$.revision' FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,done=0,next_fixture=0,retry_at=0 WHERE excluded.revision>tour_imports.revision`).bind(JSON.stringify(rows)),
    db.prepare("INSERT INTO record_cursors VALUES('tour',?) ON CONFLICT(source) DO UPDATE SET position=excluded.position WHERE position=?").bind(hasMore?end:'',cursor)
  ]);
}
async function importTour(db, job) {
  const path='tours/'+encodeURIComponent(job.id);
  const {tour}=await host(path);
  if(tour.revision!==job.revision||tour.status!=='completed')return;
  const fixtures=tour.matches||[];
  const changes=tour.sourceReconstruction?[]:await host(path+'/results').then(r=>r.applied?r.changes:[]);
  const end=Math.min(job.next_fixture+6,fixtures.length);
  for(const m of fixtures.slice(job.next_fixture,end)){
    const latest=m.reports?.at(-1);
    const report=latest?await host(path+'/report/'+encodeURIComponent(latest.id)):null;
    await storeGame(db,tourRecord(tour,m,report,changes),tour.revision);
  }
  const done=end===fixtures.length;
  const ops=[db.prepare('UPDATE tour_imports SET next_fixture=?,done=?,retry_at=0 WHERE id=? AND revision=? AND next_fixture=?')
    .bind(end,Number(done),job.id,job.revision,job.next_fixture)];
  if(done){
    const ratings=new Map(changes.map(p=>[String(p.player),p]));
    const players=[...new Map([...(tour.signupPlayers||[]),...(tour.statsPlayers||[])].map(p=>[String(p.id),p])).values()];
    const doc={schemaVersion:1,id:tour.id,name:tour.name,format:tour.format,pool:tour.mode,date:tour.date,
      endedAt:tour.concludedAt??null,teams:tour.teams.map(({id,name,players})=>({id,name,players})),
      players:players.map(p=>({id:p.id,name:p.name,ratingBefore:ratings.get(String(p.id))?.before??p.elo??null,
        ratingAfter:ratings.get(String(p.id))?.after??null})),games:fixtures.map(m=>'tour:'+tour.id+':'+m.id)};
    ops.push(db.prepare('INSERT INTO tours VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, document=excluded.document WHERE excluded.revision>=tours.revision')
      .bind(job.id,job.revision,JSON.stringify(doc)),db.prepare('DELETE FROM games WHERE tour_id=? AND revision<?').bind(job.id,job.revision));
  }
  await db.batch(ops);
}
async function tours(db) {
  await discover(db);
  const jobs=(await db.prepare('SELECT * FROM tour_imports WHERE done=0 AND retry_at<=? ORDER BY id LIMIT 2').bind(Date.now()).all()).results;
  for(const j of jobs)try {await importTour(db,j);}
  catch(err){await db.prepare('UPDATE tour_imports SET retry_at=? WHERE id=? AND revision=?').bind(Date.now()+600000,j.id,j.revision).run();console.warn('Tour archive retry',j.id,String(err));}
}
async function play(env){
  const q=env.PLAY_QUEUE.getByName('play-queues-v1');
  for(const {id,ratings} of await q.gameRecordJobs()){
    try {
      const record=await env.PLAY_MATCHES.getByName(id).getStatsRecord(ratings);
      if(!record)throw Error('Finished match metadata unavailable');
      await storeGame(env.GAME_RECORDS,record);
      await q.gameRecordDone(id,true);
    } catch(err){await q.gameRecordDone(id,false);console.warn('Match archive retry',id,String(err));}
  }
}
async function quizzes(env){
  const game=env.GAME.getByName('amqtours-economy-v1');
  for(const r of await game.quizRecordJobs()){
    await storeGame(env.GAME_RECORDS,r);
    await game.quizRecordDone(r.id);
  }
}
export async function syncGameRecords(env){
  const outcomes=await Promise.allSettled([tours(env.GAME_RECORDS),play(env),quizzes(env)]);
  for(const r of outcomes)if(r.status==='rejected')console.error('Stats archive sync',String(r.reason));
}
