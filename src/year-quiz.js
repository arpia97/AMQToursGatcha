import {fail,text} from './engine.js';
import {quizElapsed} from '../public/quiz-time.js';
import {advanceQuizRun,quizRunView} from './quiz-run-state.js';
import {quizReward,YEAR_QUIZ_LENGTH,songTypeQuiz,SONG_TYPE_LENGTH} from '../public/quiz-rules.js';

export async function yearQuizMove(e,player,path,id,body,key,draw,check,arrival){
  const variant=songTypeQuiz(id);
  const q=variant??{id,category:'year',published:1};
  const year=Number(id.slice(5));
  if(!variant&&(!/^year-\d{4}$/.test(id)||year<1924||year>=new Date(e.now()).getUTCFullYear()))fail('Choose a completed year.',422);
  e.assertAccountUnlocked(player);
  const current=()=>e.quiz.run(player,id);
  const view=(run,full=false)=>{
    const result=quizRunView(q,run,e.now(),full);
    if(run&&!run.finished&&(full||path==='quiz-next'||path==='quiz-restart'||path==='quiz-start')){
      result.run.audioWindow=run.songs.slice(run.index,run.index+6).map(song=>song.audio);
    }
    return result;
  };
  const withWallet=result=>(path==='quiz-next'||path==='quiz-stop')&&result.run?.finished
    ? {...result,me:e.player(player)}
    : result;
  if(path==='quiz-run')return view(current(),true);
  const scope=player+':'+q.category+':'+path;
  text(key,100);
  const start=path==='quiz-start'||path==='quiz-restart';
  let songs,prior;
  if(start){
    const saved=e.one('SELECT input,result FROM receipts WHERE scope=? AND key=?',scope,key);
    if(saved){
      if(saved.input!==JSON.stringify(body))fail('This request ID was used for a different action.',409);
      return withWallet(JSON.parse(saved.result));
    }
    prior=current();
  }
  if(start&&(path==='quiz-restart'||!prior||prior.finished)){
    songs=(await draw(variant?id:year)).songs;
    if(variant&&(!songs?.length||songs.length>SONG_TYPE_LENGTH))fail('Song Type quiz unavailable.',503);
    if(!variant&&songs?.length!==YEAR_QUIZ_LENGTH)fail('A full Year quiz is unavailable.',503);
    check();
  }
  const result=e.mutate(scope,key,body,()=>{
    let run=current();
    if(start){
      if(path==='quiz-start'&&run&&!run.finished)return view(run,true);
      if(!songs||run?.id!==prior?.id||path==='quiz-restart'&&(!run||run.id!==body.run||run.index!==body.index))
        fail('This quiz changed. Reopen the quiz to continue.',409);
      run={id:crypto.randomUUID(),songs:songs.map(s=>({...s,sample:(10+e.rand(61))/100})),
        clockFromAudio:true,startedAt:null,answers:[],index:0,finished:false,timing:null,
        suddenDeath:body.suddenDeath===true,skipStartCountdown:!!(path==='quiz-restart'&&!run?.finished&&run?.suddenDeath&&run.answers[run.index]?.correct===false)};
    }else{
      if(!run||run.finished||run.id!==body.run||run.index!==body.index)fail('The question changed. Reopen this quiz.',409);
      if(path==='quiz-stop'||(path==='quiz-next'&&run.index===run.songs.length-1)){
        if(path==='quiz-next'&&(run.answers.length!==run.songs.length||run.suddenDeath&&!run.answers[run.index].correct))
          fail('Complete the final song first.',409);
        if(path==='quiz-stop'&&run.answers.length<run.songs.length){
          const now=e.now();
          run.stoppedEarly=true;
          if(!run.answers[run.index]&&run.timing?.index===run.index&&run.timing.startsAt<=now)
            advanceQuizRun(run,'quiz-answer',{run:run.id,index:run.index,skip:true},now);
          run.completedAt=now;
          run.durationMs=quizElapsed(run.startedAt,now)??0;
        }
        const score=run.answers.filter(a=>a.correct).length;
        const paid=e.one('SELECT best FROM quiz_reward_history WHERE player=? AND quiz=?',player,id)?.best??0;
        const reward=quizReward(paid,score,q.category);
        const total=reward.improvement+reward.milestones;
        if(total){
          e.wallet(player,total,`${variant?'Song Type Quiz: '+variant.name:'Year Quiz: '+year} · ${score}/${run.songs.length}`,true);
          e.run('INSERT INTO quiz_reward_history VALUES(?,?,?) ON CONFLICT(player,quiz) DO UPDATE SET best=excluded.best',player,id,reward.best);
        }
        if(variant){
          const at=run.completedAt??e.now();
          e.run(`INSERT INTO quiz_progress(player,quiz,best,at,best_at,best_duration_ms) VALUES(?,?,?,?,?,?)
            ON CONFLICT(player,quiz) DO UPDATE SET best=excluded.best,at=excluded.at,best_at=excluded.best_at,best_duration_ms=excluded.best_duration_ms
            WHERE excluded.best>best OR (excluded.best=best AND excluded.best_duration_ms IS NOT NULL AND (best_duration_ms IS NULL OR excluded.best_duration_ms<best_duration_ms))`,
            player,id,score,at,at,run.stoppedEarly?null:run.durationMs);
        }
        const best=variant?reward.best:e.one('INSERT INTO year_quiz_bests(player,year,best) VALUES(?,?,?) ON CONFLICT(player,year) DO UPDATE SET best=MAX(best,excluded.best) RETURNING best',player,year,score).best;
        run.finished=true;
        run.reward={...reward,best,total};
      }else advanceQuizRun(run,path,body,e.now(),arrival);
    }
    e.quiz.persist(player,id,run);
    return view(run);
  });
  return withWallet(result);
}
