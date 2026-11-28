export function roleBadge(role) {
  if (role === "Donator") return donatorBadge(true);
  if (role === "Quiz Maker") return '<span class="role-title tier-ss" data-rarity="SS">Quiz Maker</span>';
  return role === "Host"
    ? '<span class="role-title title-ag" data-rarity="AG"><span>Host</span></span>'
    : "";
}

export const donatorBadge = active => active ? '<span class="role-title tier-sss" data-rarity="SSS">Donator</span>' : '';
