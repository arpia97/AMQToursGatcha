// All participants use the room's current-song fraction against the same MP3.
// Leave a small tail beyond the complete guess window; short tracks start at zero.
export function sampleStart(duration,position,guessSeconds){
  if(!Number.isFinite(duration)||duration<=0)return 0;
  const fraction=Math.min(1,Math.max(0,Number(position)||0));
  return Math.floor(Math.max(0,duration-guessSeconds-2)*fraction*1000)/1000;
}
