export function percentDone(done,total){
  if(!Number.isFinite(done)||!Number.isFinite(total)||total<=0)return '';
  return Math.floor(100*Math.min(total,Math.max(0,done))/total)+'%';
}

export function preparationLabel(progress={}){
  const percent=percentDone(progress.done,progress.total);
  switch(progress.stage){
    case 'catalog': return percent?'Reading song catalog · '+percent:'Loading song catalog…';
    case 'songs': return 'Checking match songs · '+percent;
    case 'finalizing': return 'Songs verified · Finalizing playlist…';
    case 'retrying': return 'Retrying match setup…';
    default: return 'Preparing your match…';
  }
}
