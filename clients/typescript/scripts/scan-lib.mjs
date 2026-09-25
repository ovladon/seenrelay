import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'coverage', '.next', '.turbo', '.cache', 'target', 'out', '.idea', '.vscode'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py', '.go', '.rs', '.rb', '.java',
  '.kt', '.kts', '.cs', '.php', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.json', '.toml', '.ini', '.cfg',
  '.md', '.mdx'
]);

const MAX_FILE_BYTES = 1_500_000;
const MAX_FILES = 5000;

const PROVIDERS = [
  { id: 'tavily', label: 'Tavily', expensive: true, patterns: [/\bTavilyClient\b/i, /@tavily\/core/i, /api\.tavily\.com\/search/i, /\btavily(?:Client)?\.search\s*\(/i] },
  { id: 'perplexity', label: 'Perplexity', expensive: true, patterns: [/api\.perplexity\.ai/i, /\bPerplexityClient\b/i, /\bPERPLEXITY_API_KEY\b/i, /\bperplexity(?:Client)?\.search\s*\(/i] },
  { id: 'exa', label: 'Exa', expensive: true, patterns: [/\bexa-js\b/i, /\bExaClient\b/i, /\bnew\s+Exa\s*\(/i, /\bexa(?:Client)?\.search(?:AndContents)?\s*\(/i] },
  { id: 'firecrawl', label: 'Firecrawl', expensive: true, patterns: [/@mendable\/firecrawl-js/i, /\bFirecrawlApp\b/i, /\bfirecrawl_scrape\b/i, /\bfirecrawl(?:Client)?\.(?:scrape|crawl|extract|map|search)\s*\(/i] },
  { id: 'browserbase', label: 'Browserbase', expensive: true, patterns: [/@browserbasehq\//i, /\bBrowserbase\b/i, /\bbrowserbase\b/i] },
  { id: 'apify', label: 'Apify', expensive: true, patterns: [/\bapify-client\b/i, /\bApifyClient\b/i, /\bclient\.actor\s*\(/i] },
  { id: 'serpapi', label: 'SerpAPI', expensive: true, patterns: [/\bserpapi\b/i, /\bSerpApi\b/i, /serpapi\.com/i] },
  { id: 'playwright', label: 'Playwright/browser automation', expensive: false, patterns: [/from\s+['"]playwright['"]/i, /require\(['"]playwright['"]\)/i, /@playwright\/test/i, /\bchromium\.launch\s*\(/i] },
  { id: 'mcp', label: 'MCP tool calls', expensive: false, patterns: [/\bcallTool\s*\(/, /\bcall_tool\s*\(/, /@modelcontextprotocol\//i] }
];

const SCHEDULE_PATTERNS = [
  /(?:^|\n)\s*schedule\s*:/i,
  /(?:^|\n)\s*-?\s*cron\s*:/i,
  /\bnode-cron\b/i,
  /\bcron\.schedule\s*\(/i,
  /\bsetInterval\s*\(/,
  /\bAPScheduler\b/i,
  /\bschedule\.every\s*\(/i,
  /\bCelery\b[\s\S]{0,300}\bbeat\b/i,
  /\bPeriodicTask\b/i,
  /\bworkflow_run\b/i,
  /\bScheduledController\b/i,
  /\bscheduled\s*\(/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bhourly\b/i
];

const NATIVE_CONTROL_PATTERNS = [
  { id: 'source_conditional', label: 'source-native conditional validation', patterns: [/If-None-Match/i, /If-Modified-Since/i, /\betag\b/i, /Last-Modified/i, /\b304\b/] },
  { id: 'mcp_cache_freshness', label: 'MCP-native ttlMs/cacheScope freshness metadata', patterns: [/\\bttlMs\\b/, /\\bcacheScope\\b/] },
  { id: 'local_cache', label: 'local/private cache or memoization', patterns: [/\bredis\b/i, /\bvalkey\b/i, /\bmemcached\b/i, /\bLRU\b/, /\bmemo(?:ize|ization|ized)?\b/i, /\bcache\b/i, /\bttl\b/i] },
  { id: 'provider_cache', label: 'provider-native cache/freshness option', patterns: [/\bmaxAge\b/, /\bmax_age\b/, /\bcache(?:d|Control|_control)?\b/i] }
];

const PROVIDER_IMPLICIT_CONTROLS = {
  firecrawl: {
    id: 'firecrawl_provider_cache',
    label: 'Firecrawl provider cache/freshness semantics (measure maxAge/storeInCache before SeenRelay)'
  }
};

const INTEGRATION_PATTERNS = [
  { id: 'mcp', label: 'MCP client', patterns: [/\bcallTool\s*\(/, /\bcall_tool\s*\(/, /@modelcontextprotocol\//i] },
  { id: 'openai_agents', label: 'OpenAI Agents', patterns: [/@openai\/agents/i, /\bopenai-agents\b/i] },
  { id: 'vercel_ai_sdk', label: 'Vercel AI SDK', patterns: [/from\s+['"]ai['"]/i, /\bcreateMCPClient\b/i, /\bexperimental_createMCPClient\b/i] },
  { id: 'langchain', label: 'LangChain', patterns: [/\blangchain\b/i, /@langchain\//i] },
  { id: 'pydantic_ai', label: 'PydanticAI', patterns: [/\bpydantic_ai\b/i, /\bpydantic-ai\b/i] }
];

const LITERAL_IDENTITY_PATTERNS = [
  /\bprompt\s*:\s*["'`][^\n"'`]{12,}["'`]/i,
  /\bquery\s*:\s*["'`][^\n"'`]{8,}["'`]/i,
  /\.search\s*\(\s*["'`][^\n"'`]{8,}["'`]/i,
  /(?:^|\n)\s*prompt\s*:\s*[^\n#]{12,}/i,
  /(?:^|\n)\s*query\s*:\s*[^\n#]{8,}/i,
  /https?:\/\/[^\s"'`]+/i
];

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function lineNumbers(text, patterns, limit = 4) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length && out.length < limit; i += 1) {
    if (patterns.some((pattern) => pattern.test(lines[i]))) out.push(i + 1);
  }
  return out;
}

function normalizeRel(root, fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/');
}

function pathSuggestsRecurrence(rel) {
  return /(?:^|\/)(?:cron|crons|jobs?|scheduled?|schedules?|workers?|watchers?|pollers?)(?:\/|\.|-|_|$)/i.test(rel);
}

function inferStatus({ providerHits, recurrence, controls }) {
  if (!providerHits.length) return 'NO_ELIGIBLE_CANDIDATE_FOUND';
  if (!recurrence) return 'NEEDS_RUNTIME_EVIDENCE';
  if (controls.length) return 'NATIVE_CONTROL_FIRST';
  return 'CANDIDATE_FOR_SHADOW_MEASUREMENT';
}

function nextStep(status) {
  switch (status) {
    case 'CANDIDATE_FOR_SHADOW_MEASUREMENT':
      return 'Run behavior-preserving shadow measurement. Keep every authoritative call enabled and measure local/source/provider-native controls before any SeenRelay reuse.';
    case 'NATIVE_CONTROL_FIRST':
      return 'Measure the detected native/local control on the same workload first. Use SeenRelay only if material residual repeated work remains.';
    case 'NEEDS_RUNTIME_EVIDENCE':
      return 'Confirm this call repeats naturally in production or scheduled execution before instrumenting it.';
    default:
      return 'No static candidate was established. Do not add SeenRelay solely to manufacture a workload.';
  }
}

async function walk(root, dir, files, ignoredDirs) {
  if (files.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await walk(root, full, files, ignoredDirs);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', 'Makefile', 'Procfile'].includes(entry.name)) continue;
    try {
      const stat = await fs.stat(full);
      if (stat.size <= MAX_FILE_BYTES) files.push(full);
    } catch {}
  }
}

export function scanText(text, rel = 'input') {
  const providerHits = PROVIDERS.filter((provider) => matchesAny(text, provider.patterns)).map((provider) => ({
    id: provider.id,
    label: provider.label,
    metered_or_resource_intensive: provider.expensive,
    lines: lineNumbers(text, provider.patterns)
  }));
  const recurrence = pathSuggestsRecurrence(rel) || matchesAny(text, SCHEDULE_PATTERNS);
  const controls = NATIVE_CONTROL_PATTERNS.filter((control) => matchesAny(text, control.patterns)).map((control) => ({
    id: control.id,
    label: control.label,
    lines: lineNumbers(text, control.patterns)
  }));
  for (const hit of providerHits) {
    const implicit = PROVIDER_IMPLICIT_CONTROLS[hit.id];
    if (implicit && !controls.some((control) => control.id === implicit.id)) {
      controls.push({
        ...implicit,
        lines: hit.lines
      });
    }
  }
  const integrations = INTEGRATION_PATTERNS.filter((integration) => matchesAny(text, integration.patterns)).map((integration) => integration.label);
  const stableIdentityVisible = matchesAny(text, LITERAL_IDENTITY_PATTERNS);
  const status = inferStatus({ providerHits, recurrence, controls });
  return {
    file: rel,
    status,
    provider_signals: providerHits,
    recurrence_signal: recurrence,
    stable_literal_or_source_identity_visible: stableIdentityVisible,
    stronger_controls_detected: controls,
    supported_integration_signals: integrations,
    next_step: nextStep(status)
  };
}

export async function scanRepository(rootPath = process.cwd(), options = {}) {
  const root = path.resolve(rootPath);
  const ignoredDirs = new Set([...DEFAULT_IGNORED_DIRS, ...(options.ignoreDirs ?? [])]);
  const files = [];
  await walk(root, root, files, ignoredDirs);

  const scanned = [];
  for (const full of files) {
    let text;
    try {
      text = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }
    const result = scanText(text, normalizeRel(root, full));
    if (result.provider_signals.length || result.recurrence_signal || result.stronger_controls_detected.length || result.supported_integration_signals.length) {
      scanned.push(result);
    }
  }

  const providerFiles = scanned.filter((item) => item.provider_signals.length);
  const candidates = providerFiles.filter((item) => item.status !== 'NO_ELIGIBLE_CANDIDATE_FOUND');
  const counts = candidates.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const overall = candidates.some((item) => item.status === 'CANDIDATE_FOR_SHADOW_MEASUREMENT')
    ? 'CANDIDATE_FOR_SHADOW_MEASUREMENT'
    : candidates.some((item) => item.status === 'NATIVE_CONTROL_FIRST')
      ? 'NATIVE_CONTROL_FIRST'
      : candidates.length
        ? 'NEEDS_RUNTIME_EVIDENCE'
        : 'NO_ELIGIBLE_CANDIDATE_FOUND';

  return {
    schema_version: 'seenrelay-static-prescreen-v1',
    root: '.',
    files_scanned: files.length,
    files_with_relevant_signals: scanned.length,
    candidate_files: candidates.length,
    overall_status: overall,
    status_counts: counts,
    disclaimer: 'Static prescreen only. This output cannot produce a SeenRelay USE verdict, authorize reuse, or establish runtime recurrence/economics.',
    candidates
  };
}

export function renderHumanReport(report) {
  const lines = [];
  lines.push('SeenRelay static prescreen');
  lines.push('==========================');
  lines.push(`Files scanned: ${report.files_scanned}`);
  lines.push(`Candidate files: ${report.candidate_files}`);
  lines.push(`Overall: ${report.overall_status}`);
  lines.push('');
  lines.push(report.disclaimer);

  for (const candidate of report.candidates) {
    lines.push('');
    lines.push(`${candidate.status}  ${candidate.file}`);
    lines.push('-'.repeat(Math.min(80, Math.max(20, candidate.file.length + candidate.status.length + 2))));
    lines.push(`Provider/work signals: ${candidate.provider_signals.map((x) => x.label).join(', ') || 'none'}`);
    lines.push(`Recurring execution visible: ${candidate.recurrence_signal ? 'yes' : 'not established'}`);
    lines.push(`Stable literal/source identity visible: ${candidate.stable_literal_or_source_identity_visible ? 'yes' : 'not established'}`);
    lines.push(`Stronger controls detected: ${candidate.stronger_controls_detected.map((x) => x.label).join(', ') || 'none detected'}`);
    lines.push(`Supported integration signals: ${candidate.supported_integration_signals.join(', ') || 'none detected'}`);
    lines.push(`Next: ${candidate.next_step}`);
  }

  if (!report.candidates.length) {
    lines.push('');
    lines.push('No eligible candidate was established statically. Do not add SeenRelay just to create activity.');
  }
  return `${lines.join('\n')}\n`;
}
