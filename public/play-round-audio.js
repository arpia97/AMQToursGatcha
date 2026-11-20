// Download readiness and a fulfilled play() promise don't guarantee continued playback.
export function roundAudio(audio, report, started) {
  let index, attempt, pending, blocked, retried, lastTime, lastProgress, attemptAt;
  function reset(round) {
    index=round;attempt=null;pending=false;blocked=false;retried=false;
    lastTime=-1;lastProgress=0;
  }
  function play(position, now, focus) {
    const token=attempt={};
    pending=true;blocked=false;attemptAt=lastProgress=now;
    try {
      audio.currentTime=Number.isFinite(audio.duration)
        ? Math.min(position,Math.max(0,audio.duration-.05)) : position;
      lastTime=audio.currentTime;
      audio.play().then(()=>{
        if(attempt!==token)return;
        pending=false;
        if(focus)started(index);
      }).catch(error=>{
        if(attempt!==token)return;
        pending=false;blocked=true;
        report(error.name==='NotAllowedError'?'blocked':'play-error');
      });
    } catch {
      pending=false;blocked=true;report('play-error');
    }
  }
  function update(round,position,manual=false) {
    if(round!==index)reset(round);
    const now=performance.now();
    if(manual){
      attempt=null;audio.pause();retried=false;play(position,now,false);return;
    }
    if(blocked)return;
    if(!attempt){play(position,now,true);return;}
    if(audio.ended)return;
    if(!pending&&!audio.paused&&audio.currentTime!==lastTime){
      lastTime=audio.currentTime;lastProgress=now;
      if(now-attemptAt>=1500)retried=false;
      return;
    }
    const paused=!pending&&audio.paused;
    if(!paused&&now-lastProgress<3500)return;
    if(retried){attempt=null;blocked=true;report(paused?'paused':'stalled');return;}
    retried=true;report(paused?'paused':'stalled');
    attempt=null;audio.pause();play(position,now,false);
  }
  reset();
  return {reset,update,get needsGesture(){return blocked;}};
}
