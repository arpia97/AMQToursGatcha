import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),{Miniflare,Response}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
export async function playRuntimeFixture(){
  const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
    import worker,{Game as OriginalGame} from './src/worker.js';
    import proxy from './src/short-url.js';
    import {PlayMatch as OriginalMatch} from './src/play-match.js';
    export {PlayQueue,QuizLibrary,QuizSession} from './src/worker.js';
    export class Game extends OriginalGame{
      async handle(request){
        if(new URL(request.url).pathname==='/api/__test-session'){
          const e=this.engine,id=new URL(request.url).searchParams.get('id');
          e.run('INSERT OR IGNORE INTO players(id,name) VALUES(?,?)',id,'Local Player '+id);
          const raw=id.padStart(48,'a'),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
          const token=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
          e.run('INSERT OR REPLACE INTO sessions VALUES(?,?,?)',token,id,Date.now()+3600000);
          return Response.json({cookie:'amq_session='+raw});
        }
        return super.handle(request);
      }
    }
    export class PlayMatch extends OriginalMatch{
      forcePhase(){const s=this.read();if(s.phase==='guess')s.startsAt=Date.now()-1;else if(s.phase==='reveal')s.until=Date.now()-1;this.write(s);return this.alarm();}
      expire(){const s=this.read();s.until=Date.now()-1;this.write(s);return this.alarm();}
    }
    export default {async fetch(request,env,ctx){
      const url=new URL(request.url);
      if(url.pathname==='/api/__advance'){await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).forcePhase();return Response.json({ok:true});}
      if(url.pathname==='/api/__expire'){await env.PLAY_MATCHES.getByName(url.searchParams.get('match')).expire();return Response.json({ok:true});}
      if(url.pathname==='/api/__fake-proxy'){const original=new Request('https://amqtours.app/gacha/api/play-connect'+url.search,request);return proxy.fetch(original,{GAME_SITE:{fetch:r=>worker.fetch(r,env,ctx)}});}
      return worker.fetch(request,env,ctx);
    }};
  `},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
  const songs=Object.fromEntries(Array.from({length:40},(_,i)=>{const id=i+1;return [id,{annSongId:id,amqSongId:1000+id,title:'Song '+id,artist:'Artist '+id,audio:'https://eudist.animemusicquiz.com/local-'+id+'.mp3',titles:['Anime '+id,'Alternative '+id]}];}));
  const manifest={schema:1,version:'play-fixture',count:40,shards:[0],amq:Object.fromEntries(Object.values(songs).map(s=>[s.amqSongId,[s.annSongId]]))};
  const asset=async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/quiz-library/manifest.json')return Response.json(manifest);
    if(path==='/quiz-library/0.json')return Response.json(songs);
    if(path==='/play-artists.json')return Response.json({names:Object.values(songs).map(s=>s.artist),rules:{},songs:{}});
    const local=path==='/play/'?'play/index.html':path.slice(1);
    if(local.includes('..'))return new Response(null,{status:404});
    try {const bytes=await readFile(new URL('../public/'+local,import.meta.url));return new Response(bytes,{headers:{'Content-Type':local.endsWith('.js')?'text/javascript':local.endsWith('.css')?'text/css':local.endsWith('.html')?'text/html':local.endsWith('.json')?'application/json':'application/octet-stream'}});}catch{return new Response('not found',{status:404});}
  };
  const names=['Game','QuizLibrary','QuizSession','PlayQueue','PlayMatch'],bindings={GAME:'Game',QUIZ_LIBRARY:'QuizLibrary',QUIZ_SESSIONS:'QuizSession',PLAY_QUEUE:'PlayQueue',PLAY_MATCHES:'PlayMatch'};
  const mf=new Miniflare({workers:[{config:{name:'play-test',compatibilityDate:'2026-10-01',manifest:{mainModule:'worker.js',modules:{'worker.js':{type:'esm',contents:bundle.outputFiles[0].text}}},exports:Object.fromEntries(names.map(name=>[name,{type:'durable-object',storage:'sqlite',state:'created'}])),env:{...Object.fromEntries(Object.entries(bindings).map(([key,value])=>[key,{type:'durable-object',worker:'play-test',exportName:value}])),ASSETS:{type:'fetcher',handler:asset},HOST_TOKEN:{type:'json',value:'local-only-test-host-token-123456789'}}}}]});
  return mf;
}
