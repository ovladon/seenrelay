const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
const token = process.env.GITHUB_TOKEN;
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
  return match ? `https://${match[1]}` : null;
}

const pull = await github(`pulls/${pr}`);
const headSha = pull?.head?.sha;
if (!headSha) throw new Error('Unable to resolve current PR head SHA');

for (let attempt = 1; attempt <= 60; attempt++) {
  const comments = await github(`issues/${pr}/comments?per_page=100`);
  const vercel = [...comments].reverse().find((comment) => comment?.user?.login === 'vercel[bot]');
  const body = String(vercel?.body || '');
  const match = body.match(/\[Preview\]\((https:\/\/[^)\s]+\.vercel\.app)\)/i);
  if (match) {
    process.stdout.write(match[1]);
    process.exit(0);
  }

  // Vercel can expose the current Preview through a check run even when no
  // issue comment is emitted. Use only checks attached to this exact PR head.
  const checks = await github(`commits/${headSha}/check-runs?per_page=100`);
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
throw new Error('Timed out waiting for the current PR Vercel Preview URL');
