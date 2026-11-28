// Live gallery counts take precedence. Use the initial scan while a gallery
// has yet to be loaded into the game's database.
const shards=new Map();
export function scannedCount(entry,image){
  if(!entry)return null;
  const primary=/^https:\/\/cdn\.myanimelist\.net\/images\/(?:characters|voiceactors)\/(\d+\/\d+)\.(?:jpe?g|webp|png)$/i.exec(image)?.[1]||'';
  return entry[0]===primary?entry[1]:null;
}
if(globalThis.customElements&&!customElements.get('gallery-count')){
  customElements.define('gallery-count',class extends HTMLElement{
    async connectedCallback(){
      const match=/^mal-(character|person)-([1-9]\d*)$/.exec(this.dataset.card);
      if(!match)return;
      const shard=match[1]+'-'+Math.floor(Number(match[2])/4096);
      if(!shards.has(shard)){
        const url=new URL('./gallery-counts/'+shard+'.json',import.meta.url);
        shards.set(shard,fetch(url).then(r=>r.ok?r.json():null).catch(()=>{shards.delete(shard);return null;}));
      }
      const entries=await shards.get(shard);
      const count=scannedCount(entries?.[match[2]],this.dataset.primary);
      if(this.isConnected&&count!=null)this.textContent=count+' alternate image'+(count===1?'':'s');
    }
  });
}
