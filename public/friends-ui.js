const person = '<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/>';
export function friendButton(p, viewer, e, compact = false) {
  const f = p.friendship || {}, own = p.id === viewer;
  const state = f.mutual ? "mutual" : f.added ? "added" : "new";
  const label = own ? "People Who Added You" : f.mutual ? "Mutual Friends · Remove Friend" : f.added ? "Added · Remove Friend" : "Add Friend";
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + person +
    (f.mutual ? '<path d="M16 4a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5v1"/>' : !f.added && !own ? '<path d="M19 5v6m-3-3h6"/>' : '') + '</svg>';
  return '<button type="button" class="friend-button is-' + state + (compact ? ' is-compact' : '') + '" ' +
    (own ? 'data-action="friends-open" data-view="incoming"' : viewer ? 'data-action="friend-set" data-player="' + e(p.id) + '" data-added="' + !f.added + '" aria-pressed="' + !!f.added + '"' : 'data-action="account"') +
    ' title="' + label + ' · ' + (f.followers || 0) + ' Added This Player" aria-label="' + e(label + ': ' + p.name) + '">' + icon +
    (compact ? '' : '<span>' + (f.followers || 0) + '</span>') + '</button>';
}
export function friendsPanel(data, {escape:e, avatarHTML, profileURL, viewer}) {
  return '<section class="friends-panel"><h2>Friends</h2><nav class="tabs" aria-label="Friends Lists">' +
    [['added','Added'],['incoming','Added You']].map(([view,label]) => '<button type="button" class="tab ' + (data.view===view?'active':'') + '" data-action="friends-open" data-view="' + view + '">' + label + '</button>').join('') +
    '</nav><div class="friends-list">' + (data.rows.length ? data.rows.map(p => '<div class="friend-row"><a href="' + profileURL(p.id) + '" data-close-dialog>' + avatarHTML(p) + '<span>' + e(p.name) + '</span></a>' + friendButton(p,viewer,e) + '</div>').join('') : '<p class="notice">' + (data.view==='added'?'Add players from their profiles or the Players tab.':'No one has added you yet.') + '</p>') +
    '</div><div class="toolbar"><button class="button secondary" data-action="friends-open" data-view="' + data.view + '" data-page="' + (data.page-1) + '" ' + (data.page<=1?'disabled':'') + '>← Previous</button><span>Page ' + data.page + '</span><button class="button secondary" data-action="friends-open" data-view="' + data.view + '" data-page="' + (data.page+1) + '" ' + (!data.hasMore?'disabled':'') + '>Next →</button></div></section>';
}
