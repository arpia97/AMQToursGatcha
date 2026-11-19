export function roleBadge(role) {
  if (role === "Quiz Maker") return '<span class="role-title tier-ss" data-rarity="SS">Quiz Maker</span>';
  return role === "Host"
    ? '<span class="role-title title-ag" data-rarity="AG"><span>Host</span></span>'
    : "";
}
