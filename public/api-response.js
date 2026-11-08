// HTTP gateways can return HTML/plain text even when an endpoint normally
// returns JSON. Never expose a raw parser exception or gateway body to users.
export async function readApiResponse(response) {
  let data;
  try {
    const raw = (await response.text()).replace(/^\uFEFF/, "");
    data = JSON.parse(raw);
    if (!data || typeof data !== "object")
      throw Error("Invalid response shape");
  } catch {
    const temporary = response.status >= 500 || response.status === 429;
    throw Object.assign(
      new Error(
        temporary
          ? "The server is temporarily unavailable. Please try again shortly."
          : "The server returned an unexpected response. Reload the page and try again.",
      ),
      {
        status: response.ok ? 502 : response.status,
        retryable: temporary || response.ok,
      },
    );
  }
  if (!response.ok) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "The request could not be completed. Please try again.";
    throw Object.assign(new Error(message), {
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }
  return data;
}
