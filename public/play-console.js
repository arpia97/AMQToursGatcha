import {playReviewPanel,mountPlayReview} from './play-review-ui.js';

export async function openPlayConsole(modal,api,esc){
  const host=(path,body)=>api('host/'+path,body);
  modal('<section class="play-console"><h2>Play Host Console</h2><section class="host-panel"><h3>Google Sheets Song Library</h3><p data-sheet-state role="status">Loading…</p><small>Weekly refresh · Sundays at 04:12 UTC</small><div><button class="button secondary" data-sheet-refresh disabled>Refresh Now</button></div></section>'+playReviewPanel()+'</section>');
  const root=document.querySelector('.play-console'),dialog=root.closest('dialog');
  const button=root.querySelector('[data-sheet-refresh]'),status=root.querySelector('[data-sheet-state]');
  let timer;
  dialog.addEventListener('close',()=>clearTimeout(timer),{once:true});
  async function update(start=false){
    if(!root.isConnected||!dialog.open)return;
    clearTimeout(timer);button.disabled=true;
    try{
      const job=await host('play-sheet',start?{}:undefined);
      if(!root.isConnected||!dialog.open)return;
      const last=job.completed?'Last published '+new Date(job.completed).toLocaleString()+' · '+job.activeRecords.toLocaleString()+' recordings.':'Using the bundled master sheet.';
      status.textContent=(job.status==='running'?'Importing · '+job.rows.toLocaleString()+' exports read. ':job.status==='failed'?'Refresh failed · '+job.error+' ':'')+last;
      button.disabled=job.status==='running';
      if(button.disabled)timer=setTimeout(update,8000);
    }catch(err){status.textContent=err.message;button.disabled=false;}
  }
  button.onclick=()=>update(true);
  await Promise.all([update(),(async()=>{
    const review=root.querySelector('.play-review');
    try{const index=await host('play-review');if(root.isConnected)mountPlayReview(review,index,host,esc);}
    catch(err){review.querySelector('[data-review-error]').textContent=err.message;}
  })()]);
}

