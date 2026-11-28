export function createDonatorCheckout({api, modal, account, refresh}) {
  const request = (action, body) => api('paypal-donator-' + action, body, undefined, {
    signal: AbortSignal.timeout(30_000),
  });

  async function sync(kind, order) {
    const player = account()?.id;
    if (!player) return;
    const result = await request('sync', {kind, ...(order ? {order} : {})});
    if (account()?.id !== player) return;
    await refresh(player);
    if (account()?.id !== player) return;
    if (result.active) return 'Donator membership is active.';
    return result.linked
      ? 'PayPal is still confirming the payment.'
      : 'No PayPal checkout is linked to this account yet.';
  }

  function open() {
    const player = account()?.id;
    if (!player) return;
    modal(
      '<h2>Donator Membership</h2>' +
      '<form id="donator-checkout-form" class="stack">' +
      '<label>Payment Type<select name="kind"><option value="pass">One-time pass · 1 month</option>' +
      '<option value="monthly">Monthly · Renews automatically</option></select></label>' +
      '<label>Amount (USD)<input type="number" name="amount" min="1" max="1000000" step="0.01" value="1.00" required></label>' +
      '<button type="submit" class="button mint">Continue to PayPal'+(location.origin==='https://amqtours.app'?'':' Sandbox')+'</button>' +
      '<button type="button" class="button secondary" data-donator-sync>Check Payment Status</button>' +
      '<p data-donator-status role="status" hidden></p></form>',
    );
    const form = document.getElementById('donator-checkout-form');
    const submit = form.querySelector('[type="submit"]');
    const check = form.querySelector('[data-donator-sync]');
    const status = form.querySelector('[data-donator-status]');
    function showStatus(message) {
      status.textContent = message || '';
      status.hidden = !message;
    }
    async function run(action) {
      if (submit.disabled || account()?.id !== player) return;
      submit.disabled = check.disabled = true;
      showStatus('');
      try {
        await action(form.elements.kind.value);
      } catch (error) {
        showStatus(error.message);
      } finally {
        submit.disabled = check.disabled = false;
      }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation();
      void run(async kind => {
        const {approval} = await request('start', {kind, amount: form.elements.amount.value});
        if (form.isConnected && form.closest('#modal')?.open && account()?.id === player) location.assign(approval);
      });
    });
    check.addEventListener('click', () => void run(async kind => showStatus(await sync(kind))));
  }

  return {open, sync};
}
