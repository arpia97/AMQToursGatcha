// Never substitute a shared beta code for an individual host-issued code.
export async function registrationForwarding(request, env) {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/api/register"
  )
    return request;
  const reader = request.clone().body?.getReader();
  if (!reader) return request;
  let length = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1000000) {
      await Promise.allSettled([reader.cancel(), request.body?.cancel()]);
      return new Response(JSON.stringify({ error: "Request too large." }), {
        status: 413,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return request;
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    String(body.code || "").trim()
  )
    return request;
  return new Response(JSON.stringify({error:"Ask a host for your one-use registration code."}),{status:401,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}
export const registrationPolicy = Object.freeze({
  registrationCodeRequired: true,
  hostIssuedSingleUse: true,
  registeredAMQIdentityRequired: true,
  minimumPasswordLength: 12,
  recoveryCodeRequired: true,
});
