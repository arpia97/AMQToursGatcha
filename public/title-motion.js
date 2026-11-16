const key = 'amqtours-title-motion';
const valid = value => ['system','on','off'].includes(value);
export function installTitleMotion() {
  let value = 'system';
  const set = next => { value = valid(next) ? next : 'system'; document.documentElement.dataset.titleMotion = value; };
  try { set(localStorage.getItem(key)); } catch { set(value); }
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) set(event.newValue); });
  return {
    get: () => value,
    set(next) { if (!valid(next)) return; set(next); try { localStorage.setItem(key, value); } catch {} },
    control() { return '<label>Title Animations<select id="settings-title-motion">'+[['system','Follow Device Preference'],['on','On'],['off','Off']].map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${label}</option>`).join('')+'</select><span class="form-hint">On keeps title effects animated when your device requests reduced motion. Saved for this browser.</span></label>'; }
  };
}
