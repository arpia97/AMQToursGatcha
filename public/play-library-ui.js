const sources = [
  ['quiz','Published Quizzes','Quiz','Checks for newly published and updated quizzes.'],
  ['sheets','Google Sheets','Sheets','Refreshes weekly on Sundays at 04:12 UTC.'],
  ['amqPlus','AMQ+ DB','AMQ+','Refreshes the AMQ+ masterlist and song metadata.'],
];

const coverageRows = [
  ['missing','In official AMQ but missing from AMQ+'],
  ['sheets','Of those, already covered by Google Sheets'],
  ['remaining','Remaining after checking Sheets and published quizzes'],
  ['eligible','Of the remaining, uploaded and non-dub for the gameplay plan'],
  ['plusOnly','In AMQ+ but absent from the official export'],
];

export function libraryPanel() {
  return `<section class="host-panel console-library" data-console-panel="library" hidden>
    <header class="console-library-header"><div><h2>Song Library</h2>
      <p>Track recordings across the three sources used by Play.</p></div>
      <dl><dt>Total unique songs</dt><dd data-inventory="total">—</dd></dl></header>
    <div class="console-library-sources">${sources.map(([source,name,short,caption])=>`<section class="console-library-source">
      <h3>${name}</h3>
      <dl><div><dt>Songs in source</dt><dd data-inventory="${source}">—</dd></div>
        <div><dt>Added to combined DB</dt><dd data-inventory="${source}Added">—</dd></div></dl>
      <p class="source-caption">${caption}</p>
      <p data-source-status="${source}" role="status"></p>
      <button type="button" class="button secondary" data-refresh="${source}">Update ${short}</button>
    </section>`).join('')}</div>
    <p data-inventory-status role="status"></p>
    <section class="console-library-coverage" aria-labelledby="amq-registration-heading">
      <header class="console-coverage-heading">
        <div><h3 id="amq-registration-heading">AMQ JSON Registration</h3>
          <small>Accepted titles share priority with published quiz answers.</small></div>
        <small><strong data-inventory="registeredAnswers">—</strong> registered entries · <strong data-inventory="registeredMatches">—</strong> playable recordings matched</small>
      </header>
      <form class="console-amq-registration" data-amq-registration>
        <label>AMQ export<input type="file" name="amqExport" accept=".json,application/json" required></label>
        <button type="submit" class="button secondary">Register AMQ JSON</button>
      </form>
      <small data-amq-registration-status role="status"></small>
    </section>
    <p class="form-hint">Registered AMQ JSONs and Published Quizzes supply the preferred answers. Sheets and AMQ+ fill the remaining gaps.</p>
    <section class="console-library-coverage" aria-labelledby="official-coverage-heading">
      <header class="console-coverage-heading">
        <div><h3 id="official-coverage-heading">Official AMQ coverage</h3><small data-official-export></small></div>
        <button type="button" class="button secondary" data-refresh="official">Update Official AMQ</button>
      </header>
      <small data-source-status="official" role="status"></small>
      <dl>${coverageRows.map(([key,label])=>`<div><dt>${label}</dt><dd data-coverage="${key}">—</dd></div>`).join('')}</dl>
    </section>
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
      if(counts.sourceOrder!=='quiz-sheets-amq-plus'){
        throw Object.assign(new Error('Song Library is updating.'),{status:405});
      }
      for(const field of root.querySelectorAll('[data-inventory]')){
        field.textContent=counts[field.dataset.inventory]?.toLocaleString()??'—';
      }
      for(const field of root.querySelectorAll('[data-coverage]')){
        field.textContent=counts.coverage?.[field.dataset.coverage]?.toLocaleString()??'—';
      }
      root.querySelector('[data-official-export]').textContent=counts.coverage
        ? 'AMQ export '+counts.coverage.officialVersion+(counts.coverage.checkedAt?' · Last checked '+date(counts.coverage.checkedAt):'')
          +(counts.coverage.source==='mirror'?' · Copy verified against AMQ '+date(counts.coverage.sourceCheckedAt):'')
        : 'Comparison currently unavailable';
      message.textContent='';
      return counts;
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
      if(source==='official'){
        status(source,'Checking the official AMQ export…');
        const checked=await host('play-library',{source:'official'});
        if(!checked.checkedAt||!checked.version)throw Error('Official AMQ refresh is updating. Please try again shortly.');
        status(source,'Updating coverage counts…');
        const counts=await inventory(true);
        if(counts && (!counts.coverage || counts.coverage.checkedAt<checked.checkedAt || counts.coverage.officialVersion!==checked.version))
          throw Error('Export checked. Reopen Song Library to reload the updated counts.');
        status(source,checked.source==='mirror'?'Coverage checked against the latest synced AMQ export.':
          checked.changed?'Official AMQ export updated.':'Official AMQ export is up to date.');
      } else if(source==='sheets'){
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
  for(const source of [...sections,'official'])button(source).onclick=()=>void update(source,true);
  const registration=root.querySelector('[data-amq-registration]');
  registration.onsubmit=async event=>{
    event.preventDefault();
    const file=registration.elements.amqExport.files[0];
    if(!file)return;
    const message=root.querySelector('[data-amq-registration-status]');
    const submit=registration.querySelector('button[type=submit]');
    if(submit.disabled)return;
    if(file.size>4000000){message.textContent='Choose an AMQ JSON file up to 4 MB.';return;}
    submit.disabled=true;
    try {
      let data;
      try { data=JSON.parse((await file.text()).replace(/^\uFEFF/,'')); }
      catch { throw Error('This file is not valid JSON.'); }
      message.textContent='Registering working titles…';
      const result=await host('play-register-amq',{export:data});
      if(!active())return;
      registration.reset();
      const updated=result.updated
        ? 'Updated '+result.updated.toLocaleString()+' recording '+(result.updated===1?'entry.':'entries.')
        : 'Those working titles are already registered.';
      message.textContent=updated+(result.skipped?' Skipped '+result.skipped.toLocaleString()+' rows without usable working titles or recording identifiers.':'');
      if(result.updated)await inventory().catch(()=>{});
    }catch(error){
      if(active())message.textContent=error.message;
    }finally{
      submit.disabled=false;
    }
  };
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
