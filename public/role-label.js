export function roleBadge(role) {
  return role === "Host"
    ? '<span class="role-title title-ag" data-rarity="AG"><span>Host</span></span>'
    : "";
}
