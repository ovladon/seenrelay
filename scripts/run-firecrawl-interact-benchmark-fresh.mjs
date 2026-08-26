const nativeFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (
    url === 'https://api.firecrawl.dev/v2/scrape' &&
    String(init.method || 'GET').toUpperCase() === 'POST' &&
    typeof init.body === 'string'
  ) {
    const payload = JSON.parse(init.body);
    payload.maxAge = 0;
    init = { ...init, body: JSON.stringify(payload) };
  }
  return nativeFetch(input, init);
};

await import('./benchmark-firecrawl-interact.mjs');
