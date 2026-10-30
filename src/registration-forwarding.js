// Workers and Durable Objects can briefly run different deployed versions.
// Older game actors accept the shared beta code for fresh ordinary accounts;
// inject it server-side while they adopt code-free registration. Never expose
// the code to the client or substitute a supplied individual recovery code.
export async function registrationForwarding(request, env) {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/api/register" ||
    !env.BETA_REGISTRATION_CODE
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
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json");
  return new Request(request, {
    headers,
    body: JSON.stringify({ ...body, code: env.BETA_REGISTRATION_CODE }),
  });
}
export const registrationPolicy = Object.freeze({
  registrationCodeRequired: false,
  registeredAMQIdentityRequired: true,
  minimumPasswordLength: 12,
  recoveryCodeRequired: true,
});
