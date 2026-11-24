import {bestMasterRecord, fileKey, sheetRecording} from './master-song-answers.js';

const AMQ_PLUS=1, SHEETS=2, QUIZ=4;

// Match across sources using the same recording identifiers and metadata
// lookups as Play. Keep inventory counts independent of audio eligibility.
export function playSongInventory(master, quizzes) {
  const sheets=master.records.map(()=>({sources:SHEETS}));
  const quiz=new Map();
  const amqPlus=new Map();
  function root(record) {
    while(record.parent){
      if(record.parent.parent)record.parent=record.parent.parent;
      record=record.parent;
    }
    return record;
  }
  function link(a,b) {
    if(!a||!b)return;
    a=root(a);b=root(b);
    if(a===b)return;
    a.sources|=b.sources;
    b.parent=a;
  }
  for(const id of quizzes.recordingIds)if(!quiz.has(id))quiz.set(id,{sources:QUIZ});
  for(const [index,row] of quizzes.rows.entries()){
    link(sheets[bestMasterRecord(master,[row])],quiz.get(quizzes.recordingIds[index]));
  }
  for(const [id] of (master.recordings||[]).entries()){
    link(sheets[id],quiz.get(bestMasterRecord(quizzes,[sheetRecording(master,id)])));
  }
  return {
    addAmqPlus(row,sheetId,quizId){
      const key=row.amqSongId?'amq:'+row.amqSongId:fileKey(row.audio)||row.audio||'ann:'+row.annSongId;
      if(!amqPlus.has(key))amqPlus.set(key,{sources:AMQ_PLUS});
      const record=amqPlus.get(key);
      link(record,sheets[sheetId]);
      link(record,quiz.get(quizId));
    },
    counts(){
      let total=0,sheetsAdded=0,quizAdded=0;
      for(const source of [amqPlus.values(),sheets,quiz.values()])for(const record of source){
        if(record.parent)continue;
        total++;
        if(record.sources&AMQ_PLUS)continue;
        if(record.sources&SHEETS)sheetsAdded++;
        else quizAdded++;
      }
      return {total,sheets:sheets.length,quiz:quiz.size,amqPlus:amqPlus.size,sheetsAdded,quizAdded};
    },
  };
}
