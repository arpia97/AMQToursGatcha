const sources = [
  ['sheets','Google Sheets','Sheets','Refreshes weekly on Sundays at 04:12 UTC.'],
  ['quiz','Published Quizzes','Quiz','Checks for newly published and updated quizzes.'],
  ['amqPlus','AMQ+ DB','AMQ+','Refreshes the AMQ+ masterlist and song metadata.'],
];

export function libraryPanel() {
  return `<section class="host-panel console-library" data-console-panel="library" hidden>
    <header class="console-library-header"><div><h2>Song Library</h2>
      <p>Track recordings across the three sources used by Play.</p></div>
      <dl><dt>Total unique songs</dt><dd data-inventory="total">—</dd></dl></header>
    <div class="console-library-sources">${sources.map(([source,name,short,caption])=>`<section class="console-library-source">
      <h3>${name}</h3>
      <dl><div><dt>Songs in source</dt><dd data-inventory="${source}">—</dd></div>
        ${source==='amqPlus'?'':`<div><dt>Unique songs added</dt><dd data-inventory="${source}Added">—</dd></div>`}</dl>
      <p class="source-caption">${caption}</p>
      <p data-source-status="${source}" role="status"></p>
      <button type="button" class="button secondary" data-refresh="${source}">Update ${short}</button>
    </section>`).join('')}</div>
    <p data-inventory-status role="status"></p>
    <p class="form-hint">Each source counts distinct recordings. Sheets adds songs missing from AMQ+. Quiz adds songs missing from both.</p>
  </section>`;
}

const date = value => new Date(value).toLocaleString();

// A deployed page can reach the previous Durable Object version during rollout.
const inventoryRetryMs=10_000;
const inventoryMaxRetries=30;

export function mountPlayLibrary(root, host) {
  let closed=false, generation=0;
  const timers=new Map(),busy=new Set();
  const sections=sources.map(([source])=>source);
  const button=source=>root.querySelector('[data-refresh="'+source+'"]');
  const status=(source,value)=>{root.querySelector('[data-source-status="'+source+'"]').textContent=value;};
  function active(){return !closed&&root.isConnected;}
  async function inventory(refresh=false, attempt=0) {
    clearTimeout(timers.get("inventory"));
    const id=++generation, message=root.querySelector('[data-inventory-status]');
    message.textContent='Loading song counts…';
    try {
      const counts=await host('play-library',refresh?{}:undefined);
      if(!active()||id!==generation)return;
      for(const field of root.querySelectorAll('[data-inventory]')){
        field.textContent=counts[field.dataset.inventory]?.toLocaleString()??'—';
      }
      message.textContent='';
    }catch(error){
      if(!active()||id!==generation)return;
      const updating=!refresh&&error.status===405;
      if(updating&&!root.hidden&&attempt<inventoryMaxRetries){
        message.textContent='Song Library is updating. Retrying counts…';
        timers.set('inventory',setTimeout(()=>void inventory(false,attempt+1).catch(()=>{}),inventoryRetryMs));
        return;
      }
      message.textContent=updating?'Song Library is still updating. Reopen this tab to try again.':'Song counts unavailable · '+error.message;
      throw error;
    }
  }
  function poll(source){
    if(!root.hidden&&active())timers.set(source,setTimeout(()=>void update(source),8000));
  }
  async function update(source, manual=false){
    if(!active()||busy.has(source))return;
    busy.add(source);
    const control=button(source);
    control.disabled=true;
    let running=false;
    clearTimeout(timers.get(source));
    try {
      if(source==='sheets'){
        const job=await host('play-sheet',manual?{}:undefined);
        running=job.status==='running';
        status(source,running?'Importing · '+job.rows.toLocaleString()+' exports read':
          job.status==='failed'?'Update failed · '+job.error:job.completed?'Published '+date(job.completed):'Using bundled sheet data');
      } else if(source==='amqPlus'){
        if(manual){
          const {message}=await host('quiz-master-refresh',{action:control.dataset.action||'start'});
          status(source,message);
        }
        const {job,current}=await host('quiz-master');
        running=job?.status==='running';
        const paused=job?.status==='paused';
        control.dataset.action=paused?'resume':'start';
        control.textContent=paused?'Resume AMQ+ Update':'Update AMQ+';
        status(source,running?'Updating · '+job.percent+'%':paused?'Update paused'+(job.error?' · '+job.error:''):
          current?.updated?'Published '+date(current.updated):'Using bundled AMQ+ data');
      } else {
        status(source,'Checking published quizzes…');
        await inventory(true);
        status(source,'Checked '+date(Date.now()));
      }
      const wasRunning=control.dataset.running==='true';
      control.dataset.running=String(running);
      if(wasRunning&&!running)await inventory().catch(()=>{});
      if(running)poll(source);
    } catch(error) {
      if(active())status(source,error.message);
    } finally{
      busy.delete(source);control.disabled=running;
    }
  }
  for(const source of sections)button(source).onclick=()=>void update(source,true);
  function stopPolling(){for(const timer of timers.values())clearTimeout(timer);timers.clear();}
  return {
    setVisible(visible){
      if(!visible){stopPolling();return;}
      void inventory().catch(()=>{});
      void update('sheets');
      void update('amqPlus');
    },
    close(){closed=true;stopPolling();},
  };
}
