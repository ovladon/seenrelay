const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
const token = process.env.GITHUB_TOKEN;
if (!repo || !pr || !token) throw new Error('GITHUB_REPOSITORY, PR_NUMBER and GITHUB_TOKEN are required');

const api = `https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`;
const headers = {
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${token}`,
  'x-github-api-version': '2022-11-28',
  'user-agent': 'seenrelay-preview-resolver'
};

for (let attempt = 1; attempt <= 60; attempt++) {
  const response = await fetch(api, { headers });
  if (!response.ok) throw new Error(`GitHub comments API returned ${response.status}`);
  const comments = await response.json();
  const vercel = [...comments].reverse().find((comment) => comment?.user?.login === 'vercel[bot]');
  const body = String(vercel?.body || '');
  const match = body.match(/\[Preview\]\((https:\/\/[^)\s]+\.vercel\.app)\)/i);
  if (match) {
    process.stdout.write(match[1]);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error('Timed out waiting for the current PR Vercel Preview URL');
