import {cardArtwork} from './card-gallery.js';
import {cardWear} from './credit-mine.js';

// A single escrow snapshot travels through listing, settlement and cancellation.
export function transferCardState(e,player,card,variant,copies){
  const art=cardArtwork(e,player,card,variant);
  if(copies==null)copies=e.one('SELECT copies FROM inventory WHERE player=? AND card=?',player,card)?.copies;
  if(!copies)return art;
  const debt=cardWear(e,player,card,variant,copies);
  if(!debt)return art;
  return JSON.stringify({...(art?JSON.parse(art):{images:[]}),wear:{debt,at:e.now()}});
}
