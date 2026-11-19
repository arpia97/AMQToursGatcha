import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),{Miniflare,Response}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
export async function playRuntimeFixture({groups=false,media}={}){
  const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
    import worker,{Game as OriginalGame} from './src/worker.js';
    import proxy from './src/short-url.js';
    import {PlayMatch as OriginalMatch} from './src/play-match.js';
    export {QuizSession} from './src/worker.js';
    import {QuizLibrary as OriginalLibrary} from './src/quiz-library-actor.js';
    export class QuizLibrary extends OriginalLibrary {}
    import {PlayQueue as OriginalQueue} from './src/play-queue.js';
    export class PlayQueue extends OriginalQueue{async ageReview(id){this.ctx.storage.sql.exec('UPDATE match_reviews SET created=? WHERE id=?',Date.now()-60*86400000,id);await this.alarm();}}
    export class Game extends OriginalGame{
      async handle(request){
        if(new URL(request.url).pathname==='/api/__test-session'){
          const e=this.engine,id=new URL(request.url).searchParams.get('id');
          e.run('INSERT OR IGNORE INTO players(id,name) VALUES(?,?)',id,'Local Player '+id);
          if(id!=='8'){
            e.run('INSERT OR IGNORE INTO catalog(id,kind,name,image) VALUES(?,?,?,?)','local-avatar','character','Local Avatar','/amq-tours-logo.png');
            e.run('INSERT OR IGNORE INTO inventory(player,card,copies,level) VALUES(?,?,1,2)',id,'local-avatar');
            e.run('UPDATE players SET avatar_card=?,avatar_crop=? WHERE id=?','local-avatar',JSON.stringify({x:.4,y:.3,zoom:1.2}),id);
          }
          const raw=id.padStart(48,'a'),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
          const token=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
          e.run('INSERT OR REPLACE INTO sessions VALUES(?,?,?)',token,id,Date.now()+3600000);
          return Response.json({cookie:'amq_session='+raw});
        }
        return super.handle(request);
      }
    }
    export class PlayMatch extends OriginalMatch{
      fixtureInfo(){const state=this.read();return {decoys:state.decoys,song:state.songs[state.index],slot:state.audioPool.findIndex(e=>e.round===state.index),animeIds:state.songs.map(song=>song.annId)};}
      async expireReview(){this.ctx.storage.sql.exec('UPDATE review_meta SET expires=1');await this.alarm();return [...this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'review_%'")].length;}
      forcePhase(){const s=this.read();if(s.phase==='guess')s.startsAt=Date.now()-1;else if(s.phase==='reveal')s.until=Date.now()-1;this.write(s);return this.alarm();}
      fixtureFinalSong(){const s=this.read();s.index=s.songs.length-1;s.phase='guess';s.startsAt=Date.now()-20000;s.until=Date.now()-1;this.write(s);return this.alarm();}
      expire(){const s=this.read();s.until=Date.now()-1;this.write(s);return this.alarm();}
    }
    export default {async fetch(request,env,ctx){
      const url=new URL(request.url);
      if(url.pathname==='/api/__advance'){await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).forcePhase();return Response.json({ok:true});}
      if(url.pathname==='/api/__expire'){await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).expire();return Response.json({ok:true});}
      if(url.pathname==='/api/__fixture-final-song'){await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).fixtureFinalSong();return Response.json({ok:true});}
      if(url.pathname==='/api/__fixture-info')return Response.json(await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).fixtureInfo());
      if(url.pathname==='/api/__expire-review'){const id=url.searchParams.get('match');await env.PLAY_QUEUE.getByName('play-queues-v1').ageReview(id);return Response.json({tables:await env.PLAY_MATCHES.getByName(id).expireReview()});}
      if(url.pathname==='/api/__fake-proxy'){const original=new Request('https://amqtours.app/gacha/api/play-connect'+url.search,request);return proxy.fetch(original,{GAME_SITE:{fetch:r=>worker.fetch(r,env,ctx)}});}
      return worker.fetch(request,env,ctx);
    }};
  `},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
  const songs=Object.fromEntries(Array.from({length:40},(_,i)=>{const id=i+1;return [id,{linkedIds:{myanimelist:id+1000,anilist:id+2000},annId:id,type:'Opening 1',annSongId:id,amqSongId:1000+id,title:'Song '+id,artist:groups?'Group '+id:'Artist '+id,audio:'https://eudist.animemusicquiz.com/local-'+id+'.mp3',titles:['Anime '+id,'Alternative '+id]}];}));
  const manifest={schema:1,version:'play-fixture',count:40,shards:[0],amq:Object.fromEntries(Object.values(songs).map(s=>[s.amqSongId,[s.annSongId]]))};
  const asset=async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/quiz-library/master-answers.json')return Response.json({version:'fixture-master',records:[[1,'Sheet Anime 1','Alternative 1']],keys:{'a:1001':0}});
    if(path==='/quiz-library/manifest.json')return Response.json(manifest);
    if(path==='/quiz-library/0.json')return Response.json(songs);
    if(path==='/quiz-library/artist-names.json')return Response.json(['Featured Singer']);
    if(path==='/play-artists.json')return Response.json({names:Object.values(songs).flatMap(s=>groups?[s.artist,'Singer A '+s.annSongId,'Singer B '+s.annSongId]:[s.artist]),rules:groups?Object.fromEntries(Object.values(songs).map(s=>[s.annSongId+' group',{names:[s.annSongId+' group'],members:[[s.annSongId+' a singer'],[s.annSongId+' b singer']],composition:['Singer A '+s.annSongId,'Singer B '+s.annSongId]}])):{},songs:{}});
    const local=path==='/play/'?'play/index.html':path.slice(1);
    if(local.includes('..'))return new Response(null,{status:404});
    try {const bytes=await readFile(new URL('../public/'+local,import.meta.url));return new Response(bytes,{headers:{'Content-Type':local.endsWith('.js')?'text/javascript':local.endsWith('.css')?'text/css':local.endsWith('.html')?'text/html':local.endsWith('.json')?'application/json':'application/octet-stream'}});}catch{return new Response('not found',{status:404});}
  };
  const names=['Game','QuizLibrary','QuizSession','PlayQueue','PlayMatch'],bindings={GAME:'Game',QUIZ_LIBRARY:'QuizLibrary',QUIZ_SESSIONS:'QuizSession',PLAY_QUEUE:'PlayQueue',PLAY_MATCHES:'PlayMatch'};
  const tourSeedRequests=[],unavailableAudio=new Set();
  const outbound=async request=>{
    const url=new URL(request.url);
    if(url.hostname==='myanimelist.net' && ['/animelist/Local/load.json','/animelist/Wide/load.json'].includes(url.pathname)){
      const rows=url.searchParams.get('offset')==='0'?[{anime_id:1003,status:2,num_watched_episodes:0},{anime_id:1004,status:6,num_watched_episodes:0}]:[];
      if(url.pathname.includes('/Wide/')&&url.searchParams.get('offset')==='0')
        return Response.json(Array.from({length:40},(_,i)=>({anime_id:1001+i,status:2,num_watched_episodes:0})));
      return Response.json(rows);
    }
    const localSong=/^\/local-(\d+)\.mp3$/.exec(url.pathname);
    if(localSong&&/^(eu|nae|naw)dist\.animemusicquiz\.com$/.test(url.hostname)){
      if(Number(localSong[1])===1||unavailableAudio.has(url.pathname))return new Response(null,{status:404});
      if(Number(localSong[1])===2)return new Response('invalid audio',{headers:{'Content-Type':'audio/mpeg'}});
      let bytes=media;
      if(!bytes){
        bytes=new Uint8Array(417*80).fill(Number(localSong[1]));
        for(let offset=0;offset<bytes.length;offset+=417)bytes.set([0xff,0xfb,0x90,0x64],offset);
      }
      return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.byteLength)}});
    }
    if(url.origin!=='https://amqtours.app'||url.pathname!=='/api/archive/profile')throw Error('Unexpected fixture fetch: '+url.origin+url.pathname);
    const id=url.searchParams.get('id'),mode=url.searchParams.get('mode');
    if(mode==='usual')tourSeedRequests.push(id);
    return Response.json({modes:[{mode,correct:[7,8,19,28,40,50,15,30][(Number(id)-1)%8],encounters:100}]});
  };
  const mf=new Miniflare({workers:[{dev:{outboundService:{type:'fetcher',handler:outbound}},config:{name:'play-test',compatibilityDate:'2026-10-01',manifest:{mainModule:'worker.js',modules:{'worker.js':{type:'esm',contents:bundle.outputFiles[0].text}}},exports:Object.fromEntries(names.map(name=>[name,{type:'durable-object',storage:'sqlite',state:'created'}])),env:{...Object.fromEntries(Object.entries(bindings).map(([key,value])=>[key,{type:'durable-object',worker:'play-test',exportName:value}])),ASSETS:{type:'fetcher',handler:asset},HOST_TOKEN:{type:'json',value:'local-only-test-host-token-123456789'}}}}]});
  mf.tourSeedRequests=tourSeedRequests;mf.unavailableAudio=unavailableAudio;
  return mf;
}
