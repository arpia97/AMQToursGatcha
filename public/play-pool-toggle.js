import {playPools, poolName} from './play-pool.js';

export function poolToggle(pool, dataAttribute, disabled=false) {
  return '<div class="play-pool-toggle" role="group" aria-label="Song Pool">'+playPools.map(value=>
    '<button type="button" '+dataAttribute+'="'+value+'" aria-pressed="'+(value===pool)+'"'+
    (disabled?' disabled':'')+'>'+poolName(value)+'</button>'
  ).join('')+'</div>';
}
