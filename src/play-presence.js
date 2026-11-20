const afkMs=180_000;
const visibleLeaseMs=90_000;
const hiddenLeaseMs=360_000;

export class PlayPresence {
  constructor(storage){
    this.sql=storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS play_presence(player TEXT PRIMARY KEY,expires INTEGER NOT NULL)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS play_tab_presence(
      player TEXT NOT NULL,tab TEXT NOT NULL,expires INTEGER NOT NULL,active_at INTEGER NOT NULL,
      quiz INTEGER NOT NULL,PRIMARY KEY(player,tab)
    )`);
  }
  record(player,details,now){
    if(!this.nextCleanup||now>=this.nextCleanup){
      this.sql.exec('DELETE FROM play_presence WHERE expires<=?',now);
      this.sql.exec('DELETE FROM play_tab_presence WHERE expires<=?',now);
      this.nextCleanup=now+60_000;
    }
    if(!details?.tab){
      this.sql.exec('INSERT OR REPLACE INTO play_presence VALUES(?,?)',player,now+visibleLeaseMs);
      return;
    }
    const idle=Math.min(86_400_000,Math.max(0,Number(details.idle)||0));
    this.sql.exec('INSERT OR REPLACE INTO play_tab_presence VALUES(?,?,?,?,?)',
      player,details.tab,now+(details.hidden?hiddenLeaseMs:visibleLeaseMs),now-Math.round(idle),Number(details.quiz));
  }
  online(now){
    const people=new Map(this.sql.exec('SELECT player FROM play_presence WHERE expires>?',now).toArray()
      .map(({player})=>[player,'browsing']));
    // A focused tab wins over any older, hidden tab for this account.
    const latest=this.sql.exec(`SELECT player,active_at,quiz FROM (
      SELECT player,active_at,quiz,ROW_NUMBER() OVER (PARTITION BY player ORDER BY active_at DESC,quiz DESC) AS priority
      FROM play_tab_presence WHERE expires>?
    ) WHERE priority=1`,now);
    for(const row of latest)people.set(row.player,now-row.active_at>=afkMs?'afk':row.quiz?'quiz':'browsing');
    return people;
  }
}
