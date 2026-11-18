export function loadOnce(load) {
  let pending;
  return () => (pending ??= load().catch(error => {
    pending = undefined;
    throw error;
  }));
}

export function loadStylesheet(url, before) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = resolve;
    link.onerror = () => {
      link.remove();
      reject(new Error("The page styles could not be loaded. Please try again."));
    };
    document.head.insertBefore(link, before || null);
  });
}
