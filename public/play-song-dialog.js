export function createSongListDialog(esc,animeTitle){
  let dialog=null,opener=null,rendered='';
  function update(match){
    if(!dialog?.open)return;
    const songs=match.songList||match.history;
    const scores=new Map(match.history.map(row=>[row.index,row.results.find(p=>p.id===match.me)]));
    const html=songs.length?'<table><thead><tr><th>#</th><th>Anime</th><th>Song</th><th>Artist</th><th>Your Score</th></tr></thead><tbody>'+songs.map(song=>{
      const result=scores.get(song.index);
      return '<tr><td>'+(song.index+1)+'</td><td>'+esc(animeTitle({anime:song.anime}))+'</td><td>'+esc(song.song)+'</td><td>'+esc(song.artist)+'</td><td>'+(result?result.earned+' / '+(match.mode==='ngmc-ranked'||match.teamFields?1:3):'—')+'</td></tr>';
    }).join('')+'</tbody></table>':'<p>Songs will appear here after they are revealed.</p>';
    if(html!==rendered){dialog.querySelector('.sa-song-list-body').innerHTML=html;rendered=html;}
  }
  function close(){dialog?.close();dialog?.remove();dialog=null;rendered='';opener?.focus({preventScroll:true});}
  return {update,close,open(match){close();opener=document.activeElement;dialog=document.createElement('dialog');dialog.className='sa-song-dialog';dialog.setAttribute('aria-labelledby','sa-song-list-title');dialog.innerHTML='<header><h2 id="sa-song-list-title">Song List</h2><button type="button" class="button secondary">Close</button></header><div class="sa-song-list-body"></div>';document.body.append(dialog);dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});dialog.showModal();update(match);}};
}
