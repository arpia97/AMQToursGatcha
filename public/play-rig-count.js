export function rigCount(player) {
  if (!Number.isInteger(player.rigs)) return '';
  const label = player.rigs === 1 ? ' rig' : ' rigs';
  return '<small title="Revealed songs drawn from this player’s Watched list">' + player.rigs + label + '</small>';
}
