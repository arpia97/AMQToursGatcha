const versus = new Set(['ngmc-ranked','1v1','3v3']);

export function matchRecords(state){
  if(state.phase!=='finished'||!versus.has(state.format)||state.teams?.length!==2)return [];
  const [a,b]=state.teams;
  return state.players.map(p=>({
    id:p.id, outcome:p.rankedLeftAt!=null?'L':a===b?'T':p.team===(a>b?0:1)?'W':'L'
  }));
}

// Older Song/Artist reviews retain team assignments and one result per player per round.
export function archivedRecords(sql,format,ratings){
  if(format==='1v1'&&ratings.length===2){
    return matchRecords({format,phase:'finished',teams:ratings.map(r=>r.correct),players:ratings.map((r,team)=>({id:r.id,team}))});
  }
  if(format!=='3v3'||ratings.length!==6)return [];
  const meta=[...sql.exec('SELECT data FROM review_meta WHERE id=1')][0];
  if(!meta)return [];
  const {players}=JSON.parse(meta.data),teams=[0,0],hits=new Set(),received=new Set();
  const expected=ratings[0].seen;
  const sides=new Map(players.map(p=>[p.id,p.team]));
  for(const {player,data} of sql.exec("SELECT player,data FROM review_events WHERE kind='round-result'")){
    const {round,correct}=JSON.parse(data),team=sides.get(player);
    if(!sides.has(player)||!Number.isInteger(round)||round<1||round>expected||!correct)return [];
    received.add(player+'|'+round);
    for(const field of ['anime','song','artist'])if(correct[field]){
      const key=[round,team,field].join('|');
      if(!hits.has(key)){teams[team]++;hits.add(key);}
    }
  }
  if(players.length!==6||ratings.some(r=>r.seen!==expected||!sides.has(r.id))||received.size!==6*expected)return [];
  return matchRecords({phase:'finished',format,teams,players});
}

export class PlayRecords{
  constructor(queue){
    this.queue=queue;
    const {storage}=queue.ctx,sql=storage.sql;
    if(!queue.rows("SELECT 1 FROM sqlite_master WHERE type='table' AND name='play_records'").length){
      storage.transactionSync(()=>{
        sql.exec('CREATE TABLE play_records(match TEXT,player TEXT,format TEXT,outcome TEXT,PRIMARY KEY(match,player))');
        sql.exec('CREATE INDEX play_records_player ON play_records(format,player,outcome)');
        sql.exec('CREATE TABLE pending_play_records(match TEXT PRIMARY KEY,format TEXT)');
        sql.exec("INSERT INTO pending_play_records SELECT id,format FROM match_reviews WHERE status='finished' AND format IN ('1v1','3v3','ngmc-ranked')");
      });
    }
  }
  save(id,format,records){
    this.queue.ctx.storage.transactionSync(()=>{
      const sql=this.queue.ctx.storage.sql;
      for(const row of records)sql.exec('INSERT OR IGNORE INTO play_records VALUES(?,?,?,?)',id,row.id,format,row.outcome);
      sql.exec('DELETE FROM pending_play_records WHERE match=?',id);
    });
  }
  pending(){return this.queue.rows('SELECT 1 FROM pending_play_records LIMIT 1').length>0;}
  async recoverBatch(){
    for(const {match,format} of this.queue.rows('SELECT match,format FROM pending_play_records ORDER BY rowid LIMIT 3')){
      const table=format==='ngmc-ranked'?'ngmc_results':'song_results';
      const receipt=this.queue.rows('SELECT data FROM '+table+' WHERE id=?',match)[0];
      if(!receipt){this.save(match,format,[]);continue;}
      const ratings=JSON.parse(receipt.data);
      const records=format==='1v1'?archivedRecords(null,format,ratings):
        await this.queue.env.PLAY_MATCHES.getByName(match).historicalRecords(format,ratings);
      this.save(match,format,records);
    }
  }
}
