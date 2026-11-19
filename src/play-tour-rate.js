import {fail} from './play-match-rules.js';
export async function loadTourRate(player,fetcher=(...args)=>fetch(...args),mode='usual'){
    for(let attempt=0;attempt<2;attempt++){
      try{
        const response=await fetcher('https://amqtours.app/api/archive/profile?id='+encodeURIComponent(player)+'&mode='+mode,{signal:AbortSignal.timeout(30000),redirect:'manual'});
        if(response.status===404)return null;
        if(!response.ok)throw Error('Tour profile HTTP '+response.status);
        const data=await response.json();
        if(!Array.isArray(data.modes))throw Error('Invalid tour profile response');
        const row=data.modes.find(m=>m.mode===mode);
        return row&&Number.isFinite(row.correct)&&Number.isFinite(row.encounters)&&row.encounters>0?Math.max(0,Math.min(100,100*row.correct/row.encounters)):null;
      }catch(error){
        console.warn('NGMC tour seed lookup failed',{attempt:attempt+1,error:error.name,detail:String(error.message).slice(0,180)});
        if(attempt===1)fail('Could not load tour guess rates. Please retry matchmaking.',503);
      }
    }
  }
