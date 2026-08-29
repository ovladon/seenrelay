import { createFirecrawlShadowPilot } from './firecrawl-shadow.js';

function isPlainOptions(value) {
  return value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value));
}

function sdkDocument(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (result.success === false) return result;
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) return result.data;
  return result;
}

function sdkResultAsMcp(result) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true, data: sdkDocument(result) })
    }]
  };
}

function measurementParams(url, options) {
  if (typeof url !== 'string' || !url || !isPlainOptions(options)) return null;
  return {
    name: 'firecrawl_scrape',
    arguments: {
      ...(options ?? {}),
      url
    }
  };
}

/**
 * Wrap a direct Firecrawl JavaScript SDK client for shadow-only SeenRelay measurement.
 * The original SDK method always runs with its original argument list and its raw result is
 * returned unchanged. `maxAgeMs` is SeenRelay measurement policy only and is never injected into
 * the Firecrawl request.
 */
export function createFirecrawlSdkShadowPilot(client, options = {}) {
  if (!client || typeof client !== 'object') throw new TypeError('client must be an object');
  const scrape = typeof client.scrape === 'function' ? client.scrape.bind(client) : null;
  const scrapeUrl = typeof client.scrapeUrl === 'function' ? client.scrapeUrl.bind(client) : null;
  if (!scrape && !scrapeUrl) throw new TypeError('client must provide scrape() or scrapeUrl()');

  const invocations = [];
  const bridge = {
    async callTool() {
      const frame = invocations.shift();
      if (!frame) throw new Error('Firecrawl SDK shadow bridge invocation missing');
      try {
        const raw = await frame.original(...frame.args);
        frame.raw = raw;
        frame.providerSucceeded = true;
        return sdkResultAsMcp(raw);
      } catch (error) {
        if (!frame.providerSucceeded) frame.providerError = error;
        throw error;
      }
    }
  };

  const measured = createFirecrawlShadowPilot(bridge, options);
  const control = measured.seenRelayFirecrawlShadowPilot;

  async function invoke(original, args) {
    const params = measurementParams(args[0], args[1]);
    if (!params || args.length > 2) return original(...args);

    const frame = {
      original,
      args,
      raw: undefined,
      providerSucceeded: false,
      providerError: null
    };
    invocations.push(frame);

    try {
      await measured.callTool(params);
    } catch (error) {
      // Once Firecrawl itself succeeded, shadow measurement must never turn that successful
      // authoritative result into an application failure (for example JSON serialization failure).
      if (frame.providerSucceeded) return frame.raw;
      throw frame.providerError ?? error;
    }
    return frame.raw;
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'seenRelayFirecrawlSdkShadowPilot') return control;
      if (property === 'scrape' && scrape) return (...args) => invoke(scrape, args);
      if (property === 'scrapeUrl' && scrapeUrl) return (...args) => invoke(scrapeUrl, args);
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
