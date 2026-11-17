// These observations are advisory, never a clock/scoring authority.
export function createPlayActivity(report){
  let controller=null;
  const snapshot=event=>report({type:'activity',event,clientAt:Date.now(),visibility:document.visibilityState==='hidden'?'hidden':'visible',focused:document.hasFocus()});
  return {
    snapshot(){snapshot('snapshot');},
    start(){
      controller?.abort();controller=new AbortController();const options={signal:controller.signal};
      document.addEventListener('visibilitychange',()=>snapshot('visibility'),options);
      window.addEventListener('focus',()=>snapshot('focus'),options);
      window.addEventListener('blur',()=>snapshot('focus'),options);
      window.addEventListener('pagehide',()=>snapshot('pagehide'),options);
      window.addEventListener('pageshow',()=>snapshot('pageshow'),options);
    },
    stop(){controller?.abort();controller=null;}
  };
}
