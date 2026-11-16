// Page-lifetime mobile shell. Existing navigation remains the source of access/URLs.
export function installMobileNavigation({ bottom, groups, route, brand, secondary, preferences = [], extraLinks = () => [], additionalLinks = () => [] }) {
  const source = document.querySelector('#navigation');
  const media = matchMedia('(max-width:850px)');
  const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  const brandLink = document.createElement('a');
  brandLink.className = 'mobile-brand'; brandLink.href = brand.href;
  const logo = document.createElement('img'); logo.src = brand.logo; logo.alt = '';
  brandLink.append(logo, document.createTextNode('AMQ TOURS'));
  document.querySelector('.topbar').prepend(brandLink);
  const nav = document.createElement('nav'); nav.className = 'mobile-nav'; nav.setAttribute('aria-label', 'Mobile navigation');
  const more = document.createElement('button'); more.type = 'button'; more.id = 'mobile-more';
  more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-expanded', 'false');
  more.innerHTML = icon('M4 6h16 M4 12h16 M4 18h16') + '<span>More</span>';
  nav.append(more); document.body.append(nav);
  const sheet = document.createElement('dialog'); sheet.className = 'mobile-sheet'; sheet.setAttribute('aria-labelledby', 'mobile-menu-title');
  sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-heading"><h2 id="mobile-menu-title">Explore</h2><button type="button" aria-label="Close menu">${icon('M6 6l12 12 M18 6L6 18')}</button></div><div class="sheet-tabs" role="tablist" aria-label="Navigation group"></div><div class="sheet-scroll"><div class="sheet-links" id="mobile-menu-links" role="tabpanel"></div><details class="sheet-settings" hidden><summary>Display Preferences</summary><div class="sheet-preferences"></div></details></div>`;
  document.body.append(sheet);
  const panel = sheet.querySelector('.sheet-links'), tabs = sheet.querySelector('.sheet-tabs'), scroll = sheet.querySelector('.sheet-scroll');
  const crossLink = document.createElement('a'); crossLink.className = 'sheet-gacha'; crossLink.href = secondary.href;
  crossLink.append(document.createTextNode(secondary.label)); const arrow = document.createElement('span'); arrow.textContent = '↗'; crossLink.append(arrow); scroll.append(crossLink);
  let activeGroup = '', previousRoute = '', oldOverflow = '', bottomHTML = '', panelHTML = '', tabsHTML = '';
  const moved = new Map();
  const preferencePlaces = new Map();
  const preferenceAnchor = preferences.map(selector => document.querySelector(selector)).find(Boolean);
  for (const selector of preferences) { const place = document.createComment('mobile preference'); preferenceAnchor?.before(place); preferencePlaces.set(selector, place); }
  function syncPreferences() {
    for (const selector of preferences) {
      const element = document.querySelector(selector);
      if (element && !moved.has(element)) { const place = preferencePlaces.get(selector); if (!place.isConnected) element.before(place); moved.set(element, place); }
    }
    for (const [element, place] of moved) {
      if (media.matches) { if (element.parentNode !== sheet.querySelector('.sheet-preferences')) sheet.querySelector('.sheet-preferences').append(element); }
      else if (place.nextSibling !== element) place.after(element);
    }
    sheet.querySelector('.sheet-settings').hidden = !moved.size;
  }
  function close() { if (sheet.open) sheet.close(); }
  function update() {
    const current = route();
    if (previousRoute && current !== previousRoute) close();
    previousRoute = current;
    const links = [...source.querySelectorAll('a')];
    const byKey = new Map(links.map(a => [a.dataset.mobileKey || keyOf(a), a]));
    for (const link of additionalLinks()) {
      const a = document.createElement('a'); a.href = link.href; a.dataset.mobileKey = link.key;
      a.innerHTML = icon(link.icon); a.append(document.createTextNode(link.label));
      if (link.active) a.setAttribute('aria-current', 'page'); byKey.set(link.key, a);
    }
    const navHTML = bottom.map(({key, label}) => {
      const original = byKey.get(key); if (!original) return '';
      const a = original.cloneNode(true); a.className = ''; a.removeAttribute('aria-label');
      a.dataset.mobilePage = key; a.removeAttribute('aria-current');
      if (current === key) a.setAttribute('aria-current', 'page');
      const span = a.querySelector('span'); if (span) span.textContent = label;
      return a.outerHTML;
    }).join('');
    if (bottomHTML !== navHTML) { bottomHTML = navHTML; nav.innerHTML = navHTML; nav.append(more); }
    if (bottom.some(b => b.key === current)) more.removeAttribute('aria-current'); else more.setAttribute('aria-current', 'page');
    const available = groups(byKey).filter(g => g.keys.some(k => byKey.has(k)));
    if (!available.some(g => g.key === activeGroup)) activeGroup = available[0]?.key || '';
    const newTabs = available.map(g => `<button type="button" role="tab" id="mobile-group-${g.key}" data-mobile-group="${g.key}" aria-controls="mobile-menu-links" aria-selected="${g.key === activeGroup}" tabindex="${g.key === activeGroup ? 0 : -1}">${g.label}</button>`).join('');
    if (tabsHTML !== newTabs) { tabsHTML = newTabs; tabs.innerHTML = newTabs; }
    panel.setAttribute('aria-labelledby', 'mobile-group-' + activeGroup);
    const chosen = available.find(g => g.key === activeGroup);
    const newPanel = (chosen?.keys || []).map(k => { const original = byKey.get(k); if (!original) return ''; const a = original.cloneNode(true); a.className = ''; return a.outerHTML; }).join('');
    if (panelHTML !== newPanel) { panelHTML = newPanel; panel.innerHTML = newPanel; }
    sheet.querySelectorAll('[data-mobile-extra]').forEach(el => el.remove());
    for (const link of extraLinks()) { const a = document.createElement('a'); a.className = 'sheet-gacha'; a.dataset.mobileExtra = ''; a.href = link.href; a.textContent = link.label + ' ↗'; scroll.insertBefore(a, crossLink); }
    syncPreferences();
  }
  function keyOf(a) { const url = new URL(a.href); if (url.hash) return url.hash.slice(1).split('/')[0]; return url.pathname.replace(/^\/(?:gacha|tour)(?:\/|$)/, '').replace(/^\/+/, '').split('/')[0] || 'home'; }
  function selectGroup(key) { activeGroup = key; update(); scroll.scrollTop = 0; tabs.querySelector('[aria-selected=true]')?.focus(); }
  more.onclick = () => { if (!media.matches) return; update(); oldOverflow = document.body.style.overflow; sheet.showModal(); more.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; };
  sheet.querySelector('.sheet-heading button').onclick = close;
  sheet.addEventListener('close', () => { more.setAttribute('aria-expanded', 'false'); document.body.style.overflow = oldOverflow; if (media.matches) more.focus({preventScroll:true}); });
  sheet.addEventListener('click', e => {
    const tab = e.target.closest('[data-mobile-group]'); if (tab) selectGroup(tab.dataset.mobileGroup);
    if (e.target.closest('a')) close();
    if (e.target === sheet) { const r = sheet.getBoundingClientRect(); if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) close(); }
  });
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const buttons = [...tabs.querySelectorAll('button')]; const i = buttons.findIndex(b => b.dataset.mobileGroup === activeGroup);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
    e.preventDefault(); selectGroup(buttons[next].dataset.mobileGroup);
  });
  media.addEventListener('change', () => { if (!media.matches) close(); syncPreferences(); });
  return { update, close };
}
