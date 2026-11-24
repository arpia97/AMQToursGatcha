// Public-stat fields only. Source records can also contain private review data and media URLs.
const finite = value => Number.isFinite(value) ? value : null;
const id = value => value == null ? null : String(value);
function player(key, name, team, before, after, score, outcome) {
  return {id:String(key), name:name ?? null, teamId:id(team), ratingBefore:finite(before),
    ratingAfter:finite(after), score:finite(score), outcome:outcome ?? null};
}
function song(number, anime, title, artist, type, results, extra = {}) {
  return {number, anime:anime ?? null, title:title ?? null, artist:artist ?? null,
    type:type ?? null, results, ...extra};
}
function result(key, correct, points) {
  const fields = {};
  for (const field of ['anime','song','artist']) if (typeof correct?.[field] === 'boolean') fields[field]=correct[field];
  return {playerId:String(key), correct:fields, points:finite(points)};
}
export function playRecord(meta, summary, rounds, ratings) {
  const saved = new Map((summary.players||[]).map(p=>[p.id,p]));
  const rated = new Map(ratings.map(p=>[p.id,p]));
  const players = meta.players.map(p=>{
    const r=rated.get(p.id), s=saved.get(p.id)||{};
    return player(p.id,p.name,p.team,r?.before??s.ratingBefore,r?.after,s.score,s.outcome);
  });
  return {schemaVersion:1,id:'play:'+meta.id, source:'play',sourceId:meta.id,tourId:null,
    format:meta.format,pool:summary.pool??null,startedAt:meta.created??null,endedAt:summary.ended??null,
    ratingScope:'match',arena:summary.arena??null,players,teams:[...new Set(players.map(p=>p.teamId).filter(v=>v!==null))].map(key=>({
      id:key,score:finite(summary.teams?.[key]),players:players.filter(p=>p.teamId===key).map(p=>p.id)})),
    songs:rounds.map(r=>song(r.index+1,r.anime,r.song,r.artist,r.songType,
      r.results.map(p=>result(p.id,p.correct,p.earned)),{teamPoints:r.points??null,lives:r.lives??null}))};
}
export function tourRecord(tour, match, report, changes) {
  const keys=[match.a,match.b].filter(Boolean);
  const teams=keys.map(key=>{const t=tour.teams.find(t=>t.id===key);
    return {id:key,name:t?.name??null,players:(match.rosters?.[key]??t?.players??[]).map(String)};});
  const names=new Map([...(tour.signupPlayers||[]),...(tour.statsPlayers||[])].map(p=>[String(p.id),p]));
  const members=new Map();
  const register=(pid,team)=>{pid=String(pid);if(!members.has(pid))members.set(pid,team);
    else if(team!=null && members.get(pid)!==team) members.set(pid,null);};
  for(const team of teams) for(const p of team.players) register(p,team.id);
  const songs=[];
  for(const [s,file] of (report?.files||[]).entries()){
    const lineup=Object.fromEntries(teams.map(t=>[t.id,(file.rosters?.[t.id]??t.players).map(String)]));
    for(const [team,ids] of Object.entries(lineup))for(const p of ids)register(p,team);
    for(const event of file.events||[]){
      const info=event.info||{}, rows=[];
      for(const [hit,ids] of [[true,event.correct],[false,event.incorrect]])
        for(const pid of ids||[]){if(!members.has(String(pid)))register(pid,null);rows.push(result(pid,{anime:hit},Number(hit)));}
      songs.push(song(songs.length+1,info.animeNames?.romaji||info.animeNames?.english,info.songName,info.artist,info.type,rows,
        {segment:s+1,sourceNumber:event.number??null,teams:lineup,rosterSource:file.rosters?'report':'fixture',
         animeEnglish:info.animeNames?.english??null,annSongId:info.annSongId??null}));
    }
  }
  return {schemaVersion:1,id:'tour:'+tour.id+':'+match.id,source:'tour',sourceId:match.id,tourId:tour.id,
    tourName:tour.name,format:tour.format,pool:tour.mode,ratingScope:'tour',startedAt:null,endedAt:report?.at??null,
    tourDate:tour.date??null,round:match.round??null,reportId:report?.id??null,score:match.score??null,scoreKind:match.scoreKind??null,teams,
    players:[...members].map(([key,team])=>{const r=changes.find(p=>String(p.player)===key);
      return player(key,names.get(key)?.name,team,r?.before??names.get(key)?.elo,r?.after,null,null);}),songs};
}
export function quizRecord(q, run, pid, name) {
  const p=player(pid,name,null,null,null,run.answers.filter(a=>a?.correct).length,null);
  return {schemaVersion:1,id:'quiz:'+run.id,source:'quiz',sourceId:run.id,tourId:null,quizId:q.id,
    quizName:q.name,format:q.category,pool:null,ratingScope:null,startedAt:run.startedAt??null,
    endedAt:run.completedAt??null,players:[p],teams:[],songs:run.songs.map((s,i)=>song(i+1,s.answers?.[0],s.title,s.artist,s.type,
      [result(pid,{anime:run.answers[i]?.correct},run.answers[i]?Number(run.answers[i].correct):null)]))};
}
