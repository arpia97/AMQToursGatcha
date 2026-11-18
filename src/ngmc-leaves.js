import {RANKED_LEAVE_COST,songRatingPools} from '../public/ngmc-leave-policy.js';

const day=86400000;
export class RankedLeaves {
  constructor(storage){
    this.storage=storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_leaves(player TEXT,match TEXT,at INTEGER,ban_until INTEGER,PRIMARY KEY(player,match))');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS song_leaves(format TEXT,player TEXT,match TEXT,at INTEGER,ban_until INTEGER,PRIMARY KEY(format,player,match))');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS song_leave_window ON song_leaves(format,player,at)');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS ngmc_leave_window ON ngmc_leaves(player,at)');
  }
  banUntil(player,format='ngmc-ranked'){
    if(Object.hasOwn(songRatingPools,format))
      return [...this.storage.sql.exec('SELECT MAX(ban_until) AS until FROM song_leaves WHERE format=? AND player=?',format,player)][0].until;
    return [...this.storage.sql.exec('SELECT MAX(ban_until) AS until FROM ngmc_leaves WHERE player=?',player)][0].until;
  }
  record(match,player,at,format='ngmc-ranked',name=player){
    const song=Object.hasOwn(songRatingPools,format);
    if(!song&&format!=='ngmc-ranked')throw Error('Unknown rating pool.');
    const table=song?'song_leaves':'ngmc_leaves',where=song?'format=? AND player=?':'player=?';
    const key=song?[format,player]:[player];
    const sql=this.storage.sql;
    return this.storage.transactionSync(()=>{
      if([...sql.exec('SELECT 1 FROM '+table+' WHERE '+where+' AND match=?',...key,match)].length)return;
      const previous=[...sql.exec('SELECT COUNT(*) AS n FROM '+table+' WHERE '+where+' AND at>? AND at<=?',...key,at-14*day,at)][0].n;
      const banUntil=previous>=2?at+3*day:null;
      if(song){
        sql.exec('INSERT INTO song_leaves VALUES(?,?,?,?,?)',format,player,match,at,banUntil);
        sql.exec(`INSERT INTO song_ratings(format,player,name,rating,correct,seen,matches) VALUES(?,?,?,?,0,0,0)
          ON CONFLICT(format,player) DO UPDATE SET rating=rating-?`,format,player,name,1000-RANKED_LEAVE_COST,RANKED_LEAVE_COST);
      }else{
        sql.exec('INSERT INTO ngmc_leaves VALUES(?,?,?,?)',player,match,at,banUntil);
        sql.exec('UPDATE ngmc_players SET elo=elo-? WHERE player=?',RANKED_LEAVE_COST,player);
      }
      sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,match);
      return {activeLeaves:previous+1,banUntil};
    });
  }
}
