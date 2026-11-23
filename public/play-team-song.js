import {ONE_TEAM_FORMAT} from './play-mode-rules.js';

export const sharedSongFormat = format =>
  format === ONE_TEAM_FORMAT || format === '1-team' || format === 'lobby-team';

// Round results contain the graded final submissions, after ballot selection.
export function teamSongResult(results) {
  const correct = {}, answers = {};
  for (const result of results) {
    for (const [field, hit] of Object.entries(result.correct ?? {})) {
      correct[field] = !!hit || !!correct[field];
      const answer = result.answers?.[field];
      if (answer && (hit || !answers[field])) answers[field] = answer;
    }
  }
  const earned = Object.values(correct).filter(Boolean).length;
  return {correct, answers, earned};
}
