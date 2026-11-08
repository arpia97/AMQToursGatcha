const overloaded = (error) =>
  error?.overloaded === true ||
  /Durable Object is overloaded/i.test(String(error?.message));
export function transientStorageError(error) {
  return (
    !overloaded(error) &&
    (error?.retryable === true ||
      /Internal error in Durable Object storage|Durable Object.*(?:reset|disconnected)|storage.*temporarily unavailable/i.test(
        String(error?.message),
      ))
  );
}
export async function durableRead(
  namespace,
  request,
  { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const read = request.method === "GET",
    attempts = read ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await namespace
        .get(namespace.idFromName("amqtours-economy-v1"))
        .fetch(request.clone());
    } catch (error) {
      if (attempt + 1 < attempts && transientStorageError(error)) {
        await wait(150 + Math.floor(Math.random() * 150));
        continue;
      }
      throw error;
    }
  }
}
export function storageUnavailableResponse(error) {
  if (!overloaded(error) && !transientStorageError(error)) return null;
  return Response.json(
    {
      error:
        "The shared database is temporarily unavailable. Please try again shortly.",
      retryable: true,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "3" },
    },
  );
}
