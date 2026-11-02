const MASTER_URL = "https://animemusicquiz.com/libraryMasterList";
const ASSET_URL = "https://quiz-assets.invalid/quiz-amq-master.json";
async function readMaster(response) {
  if (!response.ok) throw Error("AMQ source returned HTTP " + response.status);
  const reader = response.body?.getReader();
  if (!reader) throw Error("AMQ answer database is empty.");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 25000000) {
      await reader.cancel();
      throw Error("AMQ answer database exceeds the import limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (
    typeof data.masterListId !== "string" ||
    !data.masterListId ||
    !data.animeMap ||
    typeof data.animeMap !== "object" ||
    Array.isArray(data.animeMap) ||
    !Object.keys(data.animeMap).length
  )
    throw Error("Invalid AMQ answer database.");
  return { masterListId: data.masterListId, animeMap: data.animeMap };
}
export async function loadQuizMaster(fetcher, assets) {
  let upstreamStatus = null;
  try {
    const response = await fetcher(MASTER_URL, {
      signal: AbortSignal.timeout(20000),
    });
    upstreamStatus = response.status;
    return { data: await readMaster(response), mode: "live", upstreamStatus };
  } catch {
    try {
      if (!assets) throw Error("AMQ fallback is not configured.");
      const response = await assets.fetch(new Request(ASSET_URL));
      return {
        data: await readMaster(response),
        mode: "bundled",
        upstreamStatus,
      };
    } catch {
      throw Object.assign(
        new Error(
          "AMQ's answer database and its local fallback are unavailable. No pool was changed.",
        ),
        { status: 502 },
      );
    }
  }
}
