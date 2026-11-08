// Only published, versioned quiz images can be shared. Authenticated JSON,
// draft images and failures always go to the Durable Object and are never stored.
export async function cachedQuizCover(request, fetchCover, cache, waitUntil) {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.pathname !== "/api/quiz-cover" ||
    !url.searchParams.get("quiz") ||
    !/^\d+$/.test(url.searchParams.get("v") || "") ||
    [...url.searchParams.keys()].some((k) => !["quiz", "v"].includes(k))
  )
    return fetchCover();
  const key = new Request(url.href);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return hit;
    } catch {}
  }
  const response = await fetchCover();
  if (
    cache &&
    response.status === 200 &&
    /^image\/(png|jpeg|webp)$/.test(
      response.headers.get("Content-Type") || "",
    ) &&
    response.headers.get("Cache-Control")?.startsWith("public,") &&
    !response.headers.has("Set-Cookie")
  ) {
    const save = cache.put(key, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(save);
    else await save;
  }
  return response;
}
