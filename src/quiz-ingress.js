// Only the public Worker sets this value, after receiving the complete body.
// A streamed/slow body and a caller-supplied header cannot backdate an answer.
export const QUIZ_ARRIVAL_HEADER = "X-AMQ-Answer-Received-At";
export async function stampQuizAnswer(request, now = Date.now) {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/api/quiz-answer")
    return request;
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1000000) {
      await reader.cancel();
      return Response.json({ error: "Request too large." }, { status: 413 });
    }
    chunks.push(value);
  }
  const receivedAt = now(), body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers);
  headers.set(QUIZ_ARRIVAL_HEADER, String(receivedAt));
  return new Request(request, { headers, body });
}
