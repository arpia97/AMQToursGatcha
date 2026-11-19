import {avatarCropStyle} from './avatar-crop.js';
import {rarityClass} from './card-display.js';
import {cardAura, cardFrameClass} from './card-frames.js';

export function playPlayerAvatar(player, esc) {
  const {avatar, name} = player;
  const classes = 'profile-avatar play-player-avatar';
  if (!avatar?.image) return '<span class="'+classes+'" aria-hidden="true">'+esc(name.slice(0,2).toUpperCase())+'</span>';
  return '<span class="'+classes+' tier-'+rarityClass(avatar.rarity)+' '+cardFrameClass(avatar.level)+'" aria-hidden="true">'+
    cardAura(avatar.level)+'<span class="avatar-crop" style="'+avatarCropStyle(avatar.crop)+'"><img src="'+esc(avatar.image)+'" alt="" loading="lazy" decoding="async"></span></span>';
}
