import {playReviewPanel,mountPlayReview} from './play-review-ui.js?v=host-page';

export function mountPlayConsole(main,api,esc,formatName){
  main.innerHTML=`<section class="play-console">
    <header class="console-header"><h1>Play Host Console</h1>
      <div class="console-sections" role="group" aria-label="Host tools">
        <button type="button" data-section="review" aria-pressed="true">Match Review</button>
        <button type="button" data-section="library" aria-pressed="false">Song Library</button>
      </div></header>
    <div data-console-panel="review">${playReviewPanel(true)}</div>
    <section class="host-panel console-library" data-console-panel="library" hidden>
      <h2>Google Sheets Song Library</h2>
      <dl><div><dt>Last published</dt><dd data-published>—</dd></div>
      <div><dt>Recordings</dt><dd data-records>—</dd></div>
      <div><dt>Weekly refresh</dt><dd>Sundays at 04:12 UTC</dd></div></dl>
      <div class="console-sync"><p data-sheet-state role="status"></p>
        <button type="button" class="button secondary" data-sheet-refresh disabled>Refresh Now</button></div>
    </section></section>`;
  const root=main.querySelector('.play-console');
  const host=(path,body)=>api('host/'+path,body);
  const sheet=root.querySelector('[data-console-panel="library"]');
  const button=sheet.querySelector('[data-sheet-refresh]'),status=sheet.querySelector('[data-sheet-state]');
  let timer,busy=false,closed=false;
  async function update(start=false){
    if(busy||closed||!root.isConnected||sheet.hidden)return;
    busy=true;button.disabled=true;
    clearTimeout(timer);
    status.textContent=start?'Starting refresh…':'Checking library status…';
    try{
      const job=await host('play-sheet',start?{}:undefined);
      if(closed||!root.isConnected)return;
      sheet.querySelector('[data-published]').textContent=job.completed?new Date(job.completed).toLocaleString():'Bundled master sheet';
      sheet.querySelector('[data-records]').textContent=job.activeRecords?.toLocaleString()??'—';
      const running=job.status==='running';
      status.textContent=running?'Importing · '+job.rows.toLocaleString()+' exports read':
        job.status==='failed'?'Refresh failed · '+job.error:'Up to date';
      button.disabled=running;
      if(running&&!sheet.hidden)timer=setTimeout(update,8000);
    }catch(err){
      status.textContent=err.message;button.disabled=false;
    }finally{busy=false;}
  }
  button.onclick=()=>update(true);
  root.querySelector('.console-sections').onclick=event=>{
    const tab=event.target.closest('[data-section]');
    if(!tab||tab.getAttribute('aria-pressed')==='true')return;
    for(const t of root.querySelectorAll('[data-section]'))t.setAttribute('aria-pressed',String(t===tab));
    for(const panel of root.querySelectorAll('[data-console-panel]'))panel.hidden=panel.dataset.consolePanel!==tab.dataset.section;
    if(sheet.hidden)clearTimeout(timer);else void update();
  };
  mountPlayReview(root.querySelector('.play-review'),null,host,esc,formatName);
  return ()=>{closed=true;clearTimeout(timer);};
}
