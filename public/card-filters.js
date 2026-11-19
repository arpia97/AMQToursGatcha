const selector = '.collection-toolbar-main, .market-sort-controls, .trade-search, .fusion-filters';
const expanded = new Set();
const strictScopes = new Set();
const favoriteScopes = new Set();
let favoriteOwner;
export const strictCards = scope => strictScopes.has(scope);

export const favoriteCardFilter = (scope, player) => !!player && player === favoriteOwner && favoriteScopes.has(scope);

function setup(bar, reload, player) {
  const search = bar.querySelector('input.search');
  if (!search || bar.dataset.filterScope) return;
  const scope = search.id === 'search' ? (bar.closest('.catalog-toolbar') ? 'catalog' : 'collection') : search.id;
  bar.dataset.filterScope = scope;
  const panel = document.createElement('div');
  panel.className = 'card-filter-options';
  panel.id = scope + '-filter-options';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'card-filter-toggle';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 17h18M8 4v6m8 4v6"/></svg><span>Filters</span>';

  for (const control of [...bar.children]) {
    if (control.matches('.tabs,.sort-control,.search,.alchemy-type-filter') ||
        control.matches('#trade-sort,[data-action="trade-search-clear"]') ||
        control.querySelector('#fusion-kind,#fusion-sort')) continue;
    panel.append(control);
  }
  const sortHint = bar.querySelector('.sort-control .form-hint');
  if (sortHint) panel.append(sortHint);
  function addToggle(text, scopes, container = panel) {
    const label = document.createElement('label');
    label.className = 'check-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = scopes.has(scope);
    input.onchange = () => {
      if (input.checked) scopes.add(scope); else scopes.delete(scope);
      reload(scope);
    };
    label.append(input, ' ' + text);
    container.prepend(label);
  }
  if (search.id !== 'fusion-search') {
    const isFavorites = scope === 'profile-favorites-search';
    const sharedChecks = panel.querySelector('.wishlist-ownership-options, #market-wishlist-only, #profile-favorites-tradeable')?.closest('.collection-checkboxes');
    const collectionChecks = panel.querySelector('#collection-upgradable')?.closest('.collection-checkboxes');
    if (player && !isFavorites) addToggle('Favorites Only', favoriteScopes, sharedChecks);
    addToggle('Strict (exact title match)', strictScopes, sharedChecks ?? collectionChecks);
    panel.addEventListener('click', event => {
      if (event.target.closest('[data-action^="clear-"][data-action$="filters"]')) {
        strictScopes.delete(scope);
        favoriteScopes.delete(scope);
      }
    });
  }

  const chips = document.createElement('div');
  chips.className = 'card-filter-chips';
  function sync() {
    panel.hidden = !expanded.has(scope);
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    const selected = [...panel.querySelectorAll('input:checked,select')].filter(el => el.type === 'checkbox' || el.value);
    chips.replaceChildren(...selected.map(input => {
      const name = input.type === 'checkbox' ? input.closest('label').textContent.trim() : input.selectedOptions[0].textContent;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = name + ' ×';
      chip.setAttribute('aria-label', 'Remove ' + name);
      chip.onclick = () => {
        if (input.type === 'checkbox') input.checked = false; else input.value = '';
        input.dispatchEvent(new Event('change', {bubbles:true}));
      };
      return chip;
    }));
    toggle.lastElementChild.textContent = selected.length ? 'Filters · ' + selected.length : 'Filters';
  }
  toggle.onclick = () => {
    if (expanded.has(scope)) expanded.delete(scope); else expanded.add(scope);
    sync();
  };
  panel.addEventListener('change', sync);
  bar.append(toggle, panel, chips);
  sync();
}
export function installCardFilters(reload, getPlayer) {
  return {update(root = document) {
    const player = getPlayer();
    if (player !== favoriteOwner) {
      favoriteScopes.clear();
      favoriteOwner = player;
    }
    root.querySelectorAll(selector).forEach(bar => setup(bar, reload, player));
  }};
}
