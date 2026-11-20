const overloaded = (error) =>
  error?.overloaded === true ||
  /Durable Object is overloaded/i.test(String(error?.message));
export function transientStorageError(error) {
  return (
    !overloaded(error) &&
    (error?.retryable === true ||
      /Network connection lost|Internal error in Durable Object storage|Durable Object.*(?:reset|disconnected)|storage.*temporarily unavailable/i.test(
        String(error?.message),
      ))
  );
}
// Only pass operations that are read-only or have a durable idempotency receipt.
// Reacquire the stub inside the operation because a disconnected stub can stay broken.
export async function retryDurableOperation(operation, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  try { return await operation(); }
  catch(error){
    if(!transientStorageError(error))throw error;
    await wait(150+Math.floor(Math.random()*200));
    return operation();
  }
}
export function durableRead(namespace,request,{wait}={}) {
  const forward=()=>namespace.get(namespace.idFromName("amqtours-economy-v1")).fetch(request.clone());
  return request.method==='GET'&&!request.headers.has('Upgrade')?retryDurableOperation(forward,wait):forward();
}
export function storageUnavailableResponse(error, scope) {
  if (!overloaded(error) && !transientStorageError(error)) return null;
  if(scope)console.warn(JSON.stringify({event:"storage_unavailable",scope,overloaded:overloaded(error),retryable:error?.retryable===true}));
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
