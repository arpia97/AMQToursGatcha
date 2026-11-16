// Preserve filter expansion through existing renders, without moving inputs or handlers.
export function installMobileFilters() {
  const expanded = new Map();
  return { update() {
    document.querySelectorAll('.collection-toolbar-main').forEach((bar, index) => {
      if (bar.querySelector('.mobile-filter-button')) return;
      const key = (bar.closest('section')?.getAttribute('aria-label') || '') + (bar.querySelector('.search')?.id || String(index));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-filter-button';
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7h18 M3 17h18 M8 4v6 M16 14v6"/></svg><span>Filters</span>';
      const controls = [...bar.querySelectorAll(':scope > .sort-control,:scope > .catalog-refinements')];
      const refinements = bar.querySelector('.catalog-refinements:not(.sort-control)');
      const active = [...(refinements?.querySelectorAll('select,input') || [])].some(el => el.type === 'checkbox' ? el.checked : !!el.value);
      const open = expanded.has(key) ? expanded.get(key) : active;
      bar.classList.toggle('filters-open', open); button.setAttribute('aria-expanded', String(open));
      if (active) { button.querySelector('span').textContent = 'Filters •'; button.setAttribute('aria-label', 'Filters, active filters applied'); }
      controls.forEach((el, i) => { el.id ||= 'mobile-filter-' + index + '-' + i; });
      button.setAttribute('aria-controls', controls.map(el => el.id).join(' '));
      button.onclick = () => { const next = !bar.classList.contains('filters-open'); expanded.set(key, next); bar.classList.toggle('filters-open', next); button.setAttribute('aria-expanded', String(next)); };
      bar.append(button);
    });
  } };
}
