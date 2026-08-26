from pathlib import Path

# 1) Make the Preview gate assert the new generic machine contract rather than
# a legacy provider-specific sentence that PR #41 intentionally removed.
p = Path('scripts/preview-release-gate.sh')
text = p.read_text()
old = "grep -q 'Firecrawl JSON extraction smoke benchmark' /tmp/llms.txt\n"
new = (
    "grep -q '## Verified measured results' /tmp/llms.txt\n"
    "grep -q 'Structured JSON extraction /' /tmp/llms.txt\n"
    "grep -q 'fit=good; cost=better; latency=better' /tmp/llms.txt\n"
)
if old not in text:
    raise SystemExit('legacy llms gate assertion not found')
p.write_text(text.replace(old, new, 1))

# 2) Firecrawl can transiently return Job not found immediately after creating a
# fresh scrape job. Retry only documented/transient classes, with bounded
# exponential backoff. Persistent provider failure still fails the benchmark.
p = Path('scripts/benchmark-firecrawl-interact.mjs')
text = p.read_text()
anchor = """async function jsonRequest(url, options = {}) {\n  const response = await fetch(url, options);\n  const text = await response.text();\n  let body;\n  try {\n    body = text ? JSON.parse(text) : {};\n  } catch {\n    body = { raw: text };\n  }\n  if (!response.ok) {\n    const error = new Error(`HTTP ${response.status} from ${url}`);\n    error.status = response.status;\n    error.body = body;\n    throw error;\n  }\n  return { body, headers: response.headers };\n}\n"""
insert = anchor + """\nfunction sleep(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n\nfunction retryableFreshInteractError(error) {\n  const providerMessage = String(error?.body?.error ?? error?.body?.message ?? '');\n  return (error?.status === 404 && /job not found/i.test(providerMessage))\n    || error?.status === 429\n    || error?.status === 502;\n}\n\nasync function freshInteractRequest(url, options) {\n  let lastError;\n  for (let attempt = 1; attempt <= 3; attempt++) {\n    try {\n      return await jsonRequest(url, options);\n    } catch (error) {\n      lastError = error;\n      if (!retryableFreshInteractError(error) || attempt === 3) throw error;\n      await sleep(500 * (2 ** (attempt - 1)));\n    }\n  }\n  throw lastError;\n}\n"""
if anchor not in text:
    raise SystemExit('jsonRequest anchor not found')
text = text.replace(anchor, insert, 1)
old_call = "const interact = await jsonRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {"
new_call = "const interact = await freshInteractRequest(`${FIRECRAWL_BASE}/scrape/${encodeURIComponent(scrapeId)}/interact`, {"
if old_call not in text:
    raise SystemExit('fresh interact call not found')
text = text.replace(old_call, new_call, 1)
p.write_text(text)

print('PR41 gate patches applied')
