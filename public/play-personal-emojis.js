const endpoint=new URL('./api/chat-emojis',import.meta.url);
export async function emojiLibrary(player,body){
  const url=new URL(endpoint);
  url.searchParams.set('player',player);
  const res=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Could not load emojis.');
  return {manage:data.manage,items:new Map(data.items.map(item=>[':'+item.name.toLowerCase()+':',item]))};
}
export async function smallEmoji(file){
  if(!file||file.size>4*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP up to 4 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,128/Math.max(bitmap.width,bitmap.height)), canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }finally{bitmap.close();}
}
