import {fail} from './play-match-rules.js';

export function lobbySettings(data){
  const {format,seconds}=data;
  const songs=data.songs==null||data.songs===''?20:data.songs;
  if(!['lobby-team','lobby-ffa'].includes(format)||!Number.isInteger(songs)||songs<1||songs>100||
    !Number.isSafeInteger(seconds)||seconds<0||seconds>8e12)fail('Choose 1–100 songs and a positive guess time, or unlimited.');
  return {format,songs,seconds};
}

export class PlayLobbies {
  constructor(queue){
    this.queue=queue;
    this.sql=queue.ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS play_lobbies(code TEXT PRIMARY KEY,settings TEXT,match TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS lobby_members(player TEXT PRIMARY KEY,code TEXT,name TEXT,avatar TEXT,expires INTEGER)');
    if(!queue.rows('PRAGMA table_info(lobby_members)').some(c=>c.name==='last_match')){
      queue.ctx.storage.transactionSync(()=>{
        this.sql.exec('ALTER TABLE lobby_members ADD COLUMN last_match TEXT');
        this.sql.exec('UPDATE lobby_members SET last_match=(SELECT m.match FROM play_lobbies m WHERE m.code=lobby_members.code)');
      });
    }
    if(!queue.rows('PRAGMA table_info(lobby_members)').some(c=>c.name==='ready'))
      this.sql.exec('ALTER TABLE lobby_members ADD COLUMN ready INTEGER NOT NULL DEFAULT 0');
    this.sql.exec('CREATE INDEX IF NOT EXISTS lobby_roster ON lobby_members(code)');
  }
  forPlayer(player){
    return this.queue.rows('SELECT l.*,m.last_match FROM play_lobbies l JOIN lobby_members m USING(code) WHERE m.player=?',player)[0];
  }
  readyRoster(code){return this.queue.rows('SELECT player AS id,name,avatar,ready FROM lobby_members WHERE code=? AND last_match IS NULL ORDER BY rowid',code);}
  roster(code){return this.queue.rows('SELECT player AS id,name,avatar FROM lobby_members WHERE code=? ORDER BY rowid',code);}
  status(row){
    if(row.last_match)return {type:row.match===row.last_match?'matched':'lobby-ended',match:row.last_match,code:row.code};
    const players=this.readyRoster(row.code).map(({id,name,ready})=>({id,name,ready:!!ready}));
    return {type:'lobby',code:row.code,busy:!!row.match,players,host:players[0]?.id,...JSON.parse(row.settings)};
  }
  heartbeat(id){this.sql.exec('UPDATE lobby_members SET expires=? WHERE player=?',Date.now()+90000,id);}
  async leave(id){
    const row=this.forPlayer(id);if(!row)return;
    if(row.match&&row.match===row.last_match)await this.queue.env.PLAY_MATCHES.getByName(row.match).depart(id);
    this.sql.exec('DELETE FROM lobby_members WHERE player=? AND code=?',id,row.code);
    this.sql.exec('DELETE FROM play_lobbies WHERE code=? AND NOT EXISTS(SELECT 1 FROM lobby_members WHERE code=?)',row.code,row.code);
    this.queue.release(id,row.match||'');
  }
  async action(who,message){
    const row=this.forPlayer(who.id);
    if(message.type==='lobby-return'){
      if(!row||row.last_match!==message.match||row.match===message.match)fail('This match is still active or the lobby has changed.');
      this.sql.exec('UPDATE lobby_members SET last_match=NULL,ready=0 WHERE player=?',who.id);
      return;
    }
    if(message.type==='lobby-leave'){await this.leave(who.id);return;}
    if(['lobby-create','lobby-join'].includes(message.type)){
      if(row||this.queue.status(who.id).type!=='idle')fail('Leave your current queue or lobby first.');
      let code;
      if(message.type==='lobby-create'){
        code=crypto.randomUUID().slice(0,8).toUpperCase();
        this.sql.exec('INSERT INTO play_lobbies VALUES(?,?,NULL)',code,JSON.stringify(lobbySettings(message)));
      }else{
        code=String(message.code).trim().toUpperCase();
        const room=this.queue.rows('SELECT match FROM play_lobbies WHERE code=?',code)[0];
        if(!room||room.match||this.roster(code).length>=8)fail('Lobby is unavailable or full.');
      }
      this.sql.exec('INSERT INTO lobby_members(player,code,name,avatar,expires) VALUES(?,?,?,?,?)',who.id,code,who.name,JSON.stringify(who.avatar||null),Date.now()+90000);
      return;
    }
    if(!row||row.match||row.last_match)fail('Lobby is unavailable.');
    const players=this.readyRoster(row.code);
    if(message.type==='lobby-ready'){
      if(typeof message.ready!=='boolean')fail('Choose a ready status.');
      this.sql.exec('UPDATE lobby_members SET ready=? WHERE player=?',Number(message.ready),who.id);
      return;
    }
    if(players[0].id!==who.id)fail('Only the lobby host can do that.',403);
    if(!['lobby-settings','lobby-start'].includes(message.type))fail('Unknown lobby action.');
    if(message.type==='lobby-settings'){
      const settings=JSON.stringify(lobbySettings(message));
      if(settings!==row.settings)this.queue.ctx.storage.transactionSync(()=>{
        this.sql.exec('UPDATE play_lobbies SET settings=? WHERE code=?',settings,row.code);
        this.sql.exec('UPDATE lobby_members SET ready=0 WHERE code=? AND last_match IS NULL',row.code);
      });
      return;
    }
    if(!players.every(p=>p.id===who.id||p.ready))fail('Every player must be ready before starting.');
    const settings=JSON.parse(row.settings);
    const match=crypto.randomUUID(),now=Date.now(),roster=players.map(p=>({...p,avatar:JSON.parse(p.avatar)}));
    const pending={id:match,format:settings.format,players:JSON.stringify(roster),started:now};
    this.queue.ctx.storage.transactionSync(()=>{
      this.sql.exec('UPDATE play_lobbies SET match=? WHERE code=?',match,row.code);
      this.sql.exec('UPDATE lobby_members SET last_match=? WHERE code=? AND last_match IS NULL',match,row.code);
      this.sql.exec('INSERT INTO preparing VALUES(?,?,?,?)',match,pending.format,pending.players,now);
      for(const p of roster)this.sql.exec('INSERT INTO recent VALUES(?,?,?)',p.id,match,now+86400000);
      this.sql.exec('INSERT INTO match_reviews VALUES(?,?,?,?,?)',match,now,settings.format,JSON.stringify(players.map(({id,name,ready})=>({id,name,ready:id===who.id||!!ready}))),'active');
    });
    await this.queue.prepare(pending);
  }
}
