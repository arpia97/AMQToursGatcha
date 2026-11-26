import {songProgressTrigger} from './detail-popover.js';
import {matchGuessFields} from './play-mode-rules.js';
import {sharedSongFormat,teamSongResult} from './play-team-song.js';

const fieldLabels={anime:'Anime',song:'Song',artist:'Artist'};

export function playSongProgressHTML(match,escape,animeTitle) {
  const rounds=new Map(match.history.map(row=>[row.index,row]));
  const fields=matchGuessFields(match);
  const teamAnswer=sharedSongFormat(match.format) || (match.potatoes && match.teams.length===1);

  return Array.from({length:match.total},(_,index)=>{
    const row=rounds.get(index);
    if(!row?.results) {
      const state=index===match.index ? ' class="current"' : '';
      return '<i'+state+' title="Song '+(index+1)+'"></i>';
    }

    const own=row.results.find(result=>result.id===match.me);
    const view=own && teamAnswer ? teamSongResult(row.results) : own;
    const hits=fields.filter(field=>view?.correct?.[field]===true).length;
    const correct=hits===fields.length;
    const partial=hits>0 && !correct;
    const result=!view ? 'Revealed' : correct ? 'Correct' : partial ? hits+'/'+fields.length+' correct' : 'Incorrect';
    const status=!view ? 'revealed' : correct ? 'hit' : partial ? 'partial' : 'miss';
    const lobbyScore={
      correct:row.results.filter(player=>fields.some(field=>player.correct?.[field]===true)).length,
      total:match.players.length,
    };
    const answerFields=view && fields.length>1 ? fields.map(field=>({
      label:fieldLabels[field],
      value:view.answers?.[field],
      correct:view.correct?.[field]===true,
    })) : undefined;
    const details={
      title:row.song, artist:row.artist, anime:animeTitle(row),
      result, correct, partial, lobbyScore, teamAnswer,
      spectator:!view, answer:view?.answers?.[fields[0]], answerFields,
    };
    return '<i class="'+status+'">'+songProgressTrigger(match.id,index,details,escape)+'</i>';
  }).join('');
}
