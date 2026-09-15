const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
const token = process.env.GITHUB_TOKEN;
const deploymentSha = process.env.DEPLOYMENT_SHA;
if (!repo || !pr || !token) throw new Error('GITHUB_REPOSITORY, PR_NUMBER and GITHUB_TOKEN are required');

const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
  'user-agent': 'seenrelay-preview-resolver'
};

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`);
  return response.json();
}

function previewHostname(text) {
  const match = String(text || '').match(/(?:https:\/\/)?([a-z0-9][a-z0-9.-]*\.vercel\.app)(?:[/?#\s)]|$)/i);
  const candidate = match ? `https://${match[1]}` : null;
  return candidate && !candidate.includes('seenrelay-readiness-') ? candidate : null;
}

function corePreviewFromComment(body) {
  const row = String(body || '')
    .split('\n')
    .find((line) => /\[seenrelay\]\(https:\/\/vercel\.com\/[^)]+\/seenrelay\)/i.test(line));
  if (!row || /\[seenrelay-readiness\]/i.test(row)) return null;
  const match = row.match(/\[Preview\]\((https:\/\/[^)\s]+\.vercel\.app)\)/i);
  return match ? match[1] : null;
}

const pull = await github(`pulls/${pr}`);
const headSha = pull?.head?.sha;
if (!headSha) throw new Error('Unable to resolve current PR head SHA');
const targetSha = deploymentSha || headSha;

for (let attempt = 1; attempt <= 60; attempt++) {
  const comments = await github(`issues/${pr}/comments?per_page=100`);
  const vercelComments = [...comments].reverse().filter((comment) => comment?.user?.login === 'vercel[bot]');
  for (const comment of vercelComments) {
    const candidate = corePreviewFromComment(comment?.body);
    if (candidate) {
      process.stdout.write(candidate);
      process.exit(0);
    }
  }

  // Fallback for repositories where Vercel exposes a Preview hostname through
  // a check run rather than the monorepo comment. Pin it to the deployment SHA
  // that actually changed the core runtime, not to a non-deploying PR tail.
  const checks = await github(`commits/${targetSha}/check-runs?per_page=100`);
  const vercelChecks = (checks?.check_runs || []).filter((check) => check?.app?.slug === 'vercel');
  for (const check of vercelChecks) {
    const candidate = previewHostname([
      check?.output?.summary,
      check?.output?.text,
      check?.details_url,
    ].filter(Boolean).join('\n'));
    if (candidate) {
      process.stdout.write(candidate);
      process.exit(0);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error('Timed out waiting for the current PR core Vercel Preview URL');
