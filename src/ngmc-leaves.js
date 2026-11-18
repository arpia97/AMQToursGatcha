import {RANKED_LEAVE_COST} from '../public/ngmc-leave-policy.js';

const day=86400000;
export class RankedLeaves {
  constructor(storage){
    this.storage=storage;
    storage.sql.exec('CREATE TABLE IF NOT EXISTS ngmc_leaves(player TEXT,match TEXT,at INTEGER,ban_until INTEGER,PRIMARY KEY(player,match))');
    storage.sql.exec('CREATE INDEX IF NOT EXISTS ngmc_leave_window ON ngmc_leaves(player,at)');
  }
  banUntil(player){
    return [...this.storage.sql.exec('SELECT MAX(ban_until) AS until FROM ngmc_leaves WHERE player=?',player)][0].until;
  }
  record(match,player,at){
    const sql=this.storage.sql;
    return this.storage.transactionSync(()=>{
      if([...sql.exec('SELECT 1 FROM ngmc_leaves WHERE player=? AND match=?',player,match)].length)return;
      const previous=[...sql.exec('SELECT COUNT(*) AS n FROM ngmc_leaves WHERE player=? AND at>? AND at<=?',player,at-14*day,at)][0].n;
      const banUntil=previous>=2?at+3*day:null;
      sql.exec('INSERT INTO ngmc_leaves VALUES(?,?,?,?)',player,match,at,banUntil);
      sql.exec('UPDATE ngmc_players SET elo=elo-? WHERE player=?',RANKED_LEAVE_COST,player);
      sql.exec('DELETE FROM queue WHERE player=? AND match=?',player,match);
      return {activeLeaves:previous+1,banUntil};
    });
  }
}
