import { fail } from './play-match-rules.js';
export const send=(ws,value)=>{try{ws.send(JSON.stringify(value));}catch{}};
export function identity(request) {
  const value=JSON.parse(request.headers.get('X-Play-Identity')||'null');
  if(!value?.id||!value.name||value.expires<=Date.now())fail('Sign in to play.',401);
  return value;
}
export function accept(ctx,who,tag=who.id,tags=[tag]) {
  for(const old of ctx.getWebSockets(tag))old.close(4001,'Opened in another tab.');
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  ctx.acceptWebSocket(server,tags);server.serializeAttachment({...who,window:Date.now(),count:0});
  return {server,response:new Response(null,{status:101,webSocket:client})};
}
export function receive(ws,raw) {
  const who=ws.deserializeAttachment();
  if(!who||who.expires<=Date.now()){ws.close(4003,'Session expired. Reconnect.');return null;}
  if(typeof raw!=='string'||raw.length>5000)fail('Message too large.');
  if(Date.now()-who.window>10000){who.window=Date.now();who.count=0;}
  who.count++;ws.serializeAttachment(who);
  if(who.count>80)fail('Please slow down.',429);
  const message=JSON.parse(raw);
  if(!message||Array.isArray(message)||typeof message!=='object')fail('Invalid message.');
  return {who,message};
}
export const socketError=(ws,error)=>send(ws,{type:'error',message:error.status?error.message:'Connection interrupted. Please retry.'});

export function closeSocket(ws,code=1000,reason='') {
  // 1005/1006/1015 describe received closure states; they cannot be sent.
  const safe=(code>=1000&&code<=1014&&![1004,1005,1006].includes(code)||code>=3000&&code<=4999)?code:1000;
  try{ws.close(safe,reason);}catch{try{ws.close();}catch{}}
}
