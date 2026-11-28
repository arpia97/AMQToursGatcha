import {fail} from './engine.js';
import {isChatShortcode} from '../public/play-chat-emojis.js';

export function donorEmojiRequest(e,{path,post,url,body,player}){
  if(!player)fail("Sign in to use match chat.",401);
  if(path==='chat-emoji-image'){
    if(post)fail("GET required.",405);
    const row=e.one("SELECT image FROM donor_emojis WHERE id=?",url.searchParams.get('id'));
    if(!row)fail("Emoji unavailable.",404);
    return new Response(Uint8Array.from(atob(row.image),c=>c.charCodeAt(0)),{headers:{
      'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=86400'
    }});
  }
  const owner=post?player:url.searchParams.get('player')||player, active=e.player(owner).donator;
  const list=()=>active?e.all("SELECT id,name FROM donor_emojis WHERE player=? ORDER BY name",owner):[];
  if(!post)return Response.json({manage:active&&owner===player,items:list()});
  if(!active)fail("An active Donator membership is required.",403);
  e.tx(()=>{
    if(body.remove){e.run("DELETE FROM donor_emojis WHERE player=? AND id=?",owner,String(body.remove));return;}
    const {name,image}=body;
    if(typeof name!=='string'||!/^[a-z0-9_]{1,32}$/i.test(name)||isChatShortcode(':'+name+':'))fail("Choose an unused emoji name of 1–32 letters, digits or underscores.");
    if(typeof image!=='string'||image.length>131072||!image.startsWith('iVBORw0KGgo'))fail("Choose a PNG under 96 KiB.");
    let png;
    try{png=Uint8Array.from(atob(image),c=>c.charCodeAt(0));}catch{fail("Invalid PNG.");}
    const data=new DataView(png.buffer);
    if(png.length<45||data.getUint32(8)!==13||data.getUint32(12)!==0x49484452||
       ![data.getUint32(16),data.getUint32(20)].every(n=>n>=1&&n<=128)||
       data.getUint32(png.length-8)!==0x49454e44)fail("Choose a PNG up to 128 × 128.");
    const existing=e.one("SELECT image FROM donor_emojis WHERE player=? AND name=?",owner,name);
    if(existing?.image===image)return;
    if(existing)fail("This emoji name is already in use.",409);
    if(list().length>=10)fail("You can upload up to 10 emojis.",409);
    e.run("INSERT INTO donor_emojis VALUES(?,?,?,?)",crypto.randomUUID(),owner,name,image);
  });
  return Response.json({manage:true,items:list()});
}
