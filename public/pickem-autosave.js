// Serialize each pick'em's changes so the last choice is always saved last.
export function createPickemAutosave({ send, saved, failed }) {
  const requests = new Map();
  return function choose(body, identity) {
    let queue = requests.get(body.pickem);
    if (!queue) {
      queue = { running: false, next: null };
      requests.set(body.pickem, queue);
    }
    queue.next = { body, identity };
    if (queue.running) return;
    queue.running = true;
    (async () => {
      try {
        while (queue.next) {
          const request = queue.next;
          queue.next = null;
          try {
            await send(request.body, request.identity);
            if (!queue.next) await saved(request.body, request.identity);
          } catch (error) {
            if (!queue.next) failed(error, request.body, request.identity);
          }
        }
      } finally {
        queue.running = false;
        requests.delete(body.pickem);
      }
    })();
  };
}

export function focusPredictionField(form, name) {
  let control = form?.elements.namedItem(name);
  // Repeated radio names resolve to RadioNodeList rather than a focusable input.
  if (typeof control?.focus !== "function" && control?.length)
    control = [...control].find((input) => input.checked) || control[0];
  control?.focus?.({ preventScroll: true });
}
