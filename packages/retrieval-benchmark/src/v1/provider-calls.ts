export interface EndpointCalls {
  readonly requests: number;
  readonly rateLimited: number;
  readonly failed: number;
}

export interface ProviderCalls {
  readonly embed: EndpointCalls;
  readonly rerank: EndpointCalls;
}

type MutableEndpointCalls = { requests: number; rateLimited: number; failed: number };

/** Counts actual Cohere HTTP attempts, including SDK retries and rate limits. */
export const countCohereCalls = (onUpdate: (calls: ProviderCalls) => void) => {
  const counts: { embed: MutableEndpointCalls; rerank: MutableEndpointCalls } = {
    embed: { requests: 0, rateLimited: 0, failed: 0 },
    rerank: { requests: 0, rateLimited: 0, failed: 0 },
  };
  const snapshot = (): ProviderCalls => ({
    embed: { ...counts.embed },
    rerank: { ...counts.rerank },
  });
  onUpdate(snapshot());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const address =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(address);
    const endpoint =
      url.hostname === "api.cohere.com" && url.pathname === "/v2/embed"
        ? "embed"
        : url.hostname === "api.cohere.com" && url.pathname === "/v2/rerank"
          ? "rerank"
          : undefined;
    if (endpoint === undefined) return originalFetch(input, init);
    const calls = counts[endpoint];
    calls.requests++;
    onUpdate(snapshot());
    try {
      const response = await originalFetch(input, init);
      if (response.status === 429) calls.rateLimited++;
      if (!response.ok) calls.failed++;
      onUpdate(snapshot());
      return response;
    } catch (error) {
      calls.failed++;
      onUpdate(snapshot());
      throw error;
    }
  };
  return snapshot;
};
