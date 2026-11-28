export function jamPollDelay({joined,hidden,inJam,playing,chatOpen}){
  if(!joined)return inJam&&!hidden?30000:0;
  if(!hidden&&chatOpen)return 3500;
  if(playing)return hidden?12000:8000;
  return hidden?45000:15000;
}
