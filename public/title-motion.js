const key = 'amqtours-title-motion';
const valid = value => ['system','on','off'].includes(value);
export function installTitleMotion() {
  let value = 'system';
  const root = document.documentElement, observed = new Set();
  let scrollTimer, refreshFrame;
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.toggleAttribute('data-premium-visible', entry.isIntersecting);
  }, {threshold:0}) : null;
  function refresh() {
    refreshFrame = null;
    for (const el of observed) if (!el.isConnected) { observer?.unobserve(el); observed.delete(el); }
    for (const el of document.querySelectorAll('.quiz-premium-title')) if (!observed.has(el)) {
      observed.add(el);
      if (observer) observer.observe(el); else el.setAttribute('data-premium-visible','');
    }
  }
  // Ignore attribute changes from scrolling/visibility, and batch application renders.
  new MutationObserver(records => {
    const changed = records.some(record =>
      [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.matches('.quiz-premium-title') || node.querySelector('.quiz-premium-title'))) ||
      observed.size && [...record.removedNodes].some(node => node.nodeType === 1));
    if (changed && !refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  })
    .observe(document.body, {childList:true,subtree:true});
  refresh();
  document.addEventListener('scroll', () => {
    if (!observed.size) return;
    if (!root.hasAttribute('data-title-scrolling')) root.setAttribute('data-title-scrolling','');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => root.removeAttribute('data-title-scrolling'),160);
  }, {capture:true,passive:true});
  const visibility = () => root.toggleAttribute('data-title-hidden',document.hidden);
  document.addEventListener('visibilitychange',visibility); visibility();
  const set = next => { value = valid(next) ? next : 'system'; document.documentElement.dataset.titleMotion = value; };
  try { set(localStorage.getItem(key)); } catch { set(value); }
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) set(event.newValue); });
  return {
    get: () => value,
    set(next) { if (!valid(next)) return; set(next); try { localStorage.setItem(key, value); } catch {} },
    control() { return '<label>Title Animations<select id="settings-title-motion">'+[['system','Follow Device Preference'],['on','On'],['off','Off']].map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${label}</option>`).join('')+'</select><span class="form-hint">On keeps title effects animated when your device requests reduced motion. Saved for this browser.</span></label>'; }
  };
}
