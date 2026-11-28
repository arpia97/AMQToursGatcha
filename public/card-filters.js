const selector = '.collection-toolbar-main:not([data-song-filters]), .market-sort-controls, .trade-search, .fusion-filters';
const expanded = new Set();
const strictScopes = new Set();
const favoriteScopes = new Set();
let favoriteOwner;
export const strictCards = scope => strictScopes.has(scope);
export const favoriteCardFilter = (scope, player) => !!player && player === favoriteOwner && favoriteScopes.has(scope);

function group(className) {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function scopedCheck(text, scopes, scope, reload) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = scopes.has(scope);
  input.onchange = () => {
    if (input.checked) scopes.add(scope); else scopes.delete(scope);
    reload(scope);
  };
  label.append(input, text);
  return label;
}

function setup(bar, reload, player) {
  const search = bar.querySelector('input.search');
  if (!search || bar.dataset.filterScope) return;
  const scope = search.id === 'search' ? (bar.closest('.catalog-toolbar') ? 'catalog' : 'collection') : search.id;
  bar.dataset.filterScope = scope;

  const tabs = bar.querySelector('.tabs');
  const clearSearch = bar.querySelector('[data-action="trade-search-clear"]');
  const clearFilters = bar.querySelector('[data-action^="clear-"][data-action$="filters"]');
  const hint = bar.querySelector('.form-hint');
  const fields = group('card-filter-fields');
  const dropdowns = [...bar.querySelectorAll('select')];
  // Keep Sort By beside the search box in every browser, including Trades.
  const sort = dropdowns.find(select => select.id.endsWith('-sort'));
  if (sort) dropdowns.unshift(...dropdowns.splice(dropdowns.indexOf(sort), 1));
  for (const select of dropdowns) {
    let label = select.closest('label');
    if (!label) {
      label = document.createElement('label');
      label.append(select.getAttribute('aria-label'), select);
    }
    label.classList.add('card-filter-field');
    fields.append(label);
  }

  const panel = group('card-filter-options');
  panel.id = scope + '-filter-options';
  const checks = group('card-filter-checks');
  checks.setAttribute('role', 'group');
  checks.setAttribute('aria-label', 'Card filters');
  const originals = bar.querySelectorAll('label:has(input[type="checkbox"])');
  const strict = scopedCheck('Strict (exact title match)', strictScopes, scope, reload);
  if (search.id !== 'fusion-search') {
    if (player && scope !== 'profile-favorites-search') checks.append(scopedCheck('Favorites Only', favoriteScopes, scope, reload));
    if (!bar.querySelector('#collection-upgradable')) checks.prepend(strict);
  }
  for (const label of originals) {
    if (label.querySelector('#collection-upgradable')) checks.append(strict);
    // Keep the paired ownership controls together for their change handler.
    const pair = label.closest('.wishlist-ownership-options');
    if (!pair || pair.parentNode !== checks) checks.append(pair || label);
  }
  panel.append(checks);
  if (clearFilters) {
    clearFilters.addEventListener('click', () => {
      strictScopes.delete(scope);
      favoriteScopes.delete(scope);
    });
    panel.append(clearFilters);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'card-filter-toggle';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 17h18M8 4v6m8 4v6"/></svg><span>Filters</span>';
  fields.append(toggle);
  const chips = group('card-filter-chips');

  function sync() {
    panel.hidden = !expanded.has(scope);
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    const selected = [...checks.querySelectorAll('input:checked')];
    toggle.lastElementChild.textContent = selected.length ? 'Filters · ' + selected.length : 'Filters';
    chips.replaceChildren();
    if (!panel.hidden) return;
    for (const input of selected) {
      const name = input.closest('label').textContent.trim();
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = name + ' ×';
      chip.setAttribute('aria-label', 'Remove ' + name);
      chip.onclick = () => {
        input.checked = false;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      };
      chips.append(chip);
    }
  }
  toggle.onclick = () => {
    if (expanded.has(scope)) expanded.delete(scope); else expanded.add(scope);
    sync();
  };
  panel.addEventListener('change', sync);
  bar.replaceChildren(...[tabs, search, clearSearch, fields, panel, chips, hint].filter(Boolean));
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
