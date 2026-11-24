import {libraryPanel,mountPlayLibrary} from './play-library-ui.js?v=official-refresh-2';
import {playReviewPanel,mountPlayReview} from './play-review-ui.js?v=host-page';

export function mountPlayConsole(main,api,esc,formatName){
  main.innerHTML=`<section class="play-console">
    <header class="console-header"><h1>Play Host Console</h1>
      <div class="console-sections" role="group" aria-label="Host tools">
        <button type="button" data-section="review" aria-pressed="true">Match Review</button>
        <button type="button" data-section="library" aria-pressed="false">Song Library</button>
      </div></header>
    <div data-console-panel="review">${playReviewPanel(true)}</div>
    ${libraryPanel()}</section>`;
  const root=main.querySelector('.play-console');
  const host=(path,body)=>api('host/'+path,body,undefined,path==='play-library'?{signal:AbortSignal.timeout(90000)}:undefined);
  const library=mountPlayLibrary(root.querySelector('.console-library'),host);
  root.querySelector('.console-sections').onclick=event=>{
    const tab=event.target.closest('[data-section]');
    if(!tab||tab.getAttribute('aria-pressed')==='true')return;
    for(const t of root.querySelectorAll('[data-section]'))t.setAttribute('aria-pressed',String(t===tab));
    for(const panel of root.querySelectorAll('[data-console-panel]'))panel.hidden=panel.dataset.consolePanel!==tab.dataset.section;
    library.setVisible(tab.dataset.section==='library');
  };
  mountPlayReview(root.querySelector('.play-review'),null,host,esc,formatName);
  return library.close;
}
