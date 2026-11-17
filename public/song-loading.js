// Visual adapted from the user-supplied Uiverse.io loader by mrhyddenn.
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export function songLoadingBar({id='',label='Loading Audio',loaded=null,total=null}={}) {
  const known=Number.isFinite(loaded)&&Number.isFinite(total)&&total>0;
  const value=known?Math.min(total,Math.max(0,loaded)):0;
  return '<div '+(id?'id="'+escape(id)+'" ':'')+'class="song-loading-bar'+(known?'':' is-preparing')+'" role="progressbar" aria-label="'+escape(label)+'"'+(known?' aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+value+'"':'')+' style="--song-load:'+ (known?value/total:0)+'"><span aria-hidden="true"></span></div>';
}
export function updateSongLoadingBar(bar,loaded,total) {
  if(!bar)return;
  const known=Number.isFinite(loaded)&&Number.isFinite(total)&&total>0;
  bar.classList.toggle('is-preparing',!known);
  if(known){const value=Math.min(total,Math.max(0,loaded));bar.style.setProperty('--song-load',String(value/total));bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-valuenow',String(value));}
  else for(const key of ['aria-valuemin','aria-valuemax','aria-valuenow'])bar.removeAttribute(key);
}
