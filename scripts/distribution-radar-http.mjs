const DEFAULT_USER_AGENT = 'SeenRelay-Distribution-Radar/1.1 (+https://seenrelay.com)';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class RegistryProbeError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'RegistryProbeError';
    this.kind = kind;
    this.details = details;
  }
}

export function containsObject(root, predicate) {
  if (Array.isArray(root)) return root.some((value) => containsObject(value, predicate));
  if (!root || typeof root !== 'object') return false;
  if (predicate(root)) return true;
  return Object.values(root).some((value) => containsObject(value, predicate));
}

export async function requestWithRetry(url, {
  json = false,
  attempts = 3,
  timeoutMs = 20_000,
  fetchImpl = globalThis.fetch,
  sleepImpl = defaultSleep,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is unavailable');
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('attempts must be a positive integer');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': userAgent, accept: json ? 'application/json' : '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`.trim());
        error.retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        throw error;
      }
      if (!json) return text;
      try {
        return JSON.parse(text);
      } catch {
        const error = new Error('response was not valid JSON');
        error.retryable = true;
        throw error;
      }
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable !== false;
      if (!retryable || attempt >= attempts) break;
      await sleepImpl(750 * attempt);
    }
  }

  throw new Error(`request failed after bounded retries: ${errorMessage(lastError)}`);
}

function hasExactRegistryVersion(body, name, version) {
  return containsObject(body, (value) => value?.name === name && value?.version === version);
}

export async function lookupOfficialMcpRegistryVersion({
  name,
  version,
  request = requestWithRetry
}) {
  if (!name || !version) throw new Error('registry name and version are required');

  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const exactUrl = `https://registry.modelcontextprotocol.io/v0.1/servers/${encodedName}/versions/${encodedVersion}`;
  const searchUrl = `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodedName}`;

  let exactResponseReceived = false;
  let exactFailure = null;
  try {
    const body = await request(exactUrl, { json: true });
    exactResponseReceived = true;
    if (hasExactRegistryVersion(body, name, version)) {
      return {
        mode: 'exact-version',
        detail: `${name}@${version} (exact-version lookup)`
      };
    }
    exactFailure = new Error('exact-version endpoint returned a valid response without the expected server version');
  } catch (error) {
    exactFailure = error;
  }

  let searchResponseReceived = false;
  let searchFailure = null;
  try {
    const body = await request(searchUrl, { json: true });
    searchResponseReceived = true;
    if (hasExactRegistryVersion(body, name, version)) {
      return {
        mode: 'search-fallback',
        detail: `${name}@${version} (search fallback; exact-version lookup unavailable: ${errorMessage(exactFailure)})`
      };
    }
    searchFailure = new Error('search endpoint returned a valid response without the expected server version');
  } catch (error) {
    searchFailure = error;
  }

  if (exactResponseReceived || searchResponseReceived) {
    throw new RegistryProbeError(
      'semantic_drift',
      `${name}@${version} is not discoverable after exact-version and search verification`,
      {
        exact: errorMessage(exactFailure),
        search: errorMessage(searchFailure)
      }
    );
  }

  throw new RegistryProbeError(
    'upstream_unavailable',
    'Official MCP Registry was unreachable through both exact-version and search probes after bounded retries',
    {
      exact: errorMessage(exactFailure),
      search: errorMessage(searchFailure)
    }
  );
}
