(() => {
  const form = document.getElementById('readiness-form');
  if (!form) return;
  const input = document.getElementById('readiness-site');
  const empty = document.getElementById('readiness-empty');
  const output = document.getElementById('readiness-output');
  const verdict = document.getElementById('readiness-verdict');
  const headline = document.getElementById('readiness-headline');
  const checks = document.getElementById('readiness-checks');
  const next = document.getElementById('readiness-next');
  const limitations = document.getElementById('readiness-limitations');
  const button = form.querySelector('button[type="submit"]');

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function showError(message) {
    empty.hidden = true;
    output.hidden = false;
    verdict.className = 'readiness-verdict error';
    verdict.textContent = 'AUDIT NOT COMPLETED';
    headline.textContent = message;
    clear(checks); clear(next); clear(limitations);
  }

  function render(report) {
    empty.hidden = true;
    output.hidden = false;
    verdict.className = `readiness-verdict ${String(report.verdict || '').toLowerCase()}`;
    verdict.textContent = report.verdict || 'UNKNOWN';
    headline.textContent = report.headline || '';
    clear(checks); clear(next); clear(limitations);

    for (const item of report.checks || []) {
      const card = document.createElement('div');
      card.className = 'readiness-check';
      card.appendChild(textElement('span', `readiness-status ${String(item.status || '').toLowerCase()}`, item.status || 'INFO'));
      const copy = document.createElement('div');
      copy.appendChild(textElement('b', '', item.label || 'Check'));
      copy.appendChild(textElement('p', '', item.detail || ''));
      card.appendChild(copy);
      checks.appendChild(card);
    }
    for (const item of report.next_steps || []) next.appendChild(textElement('li', '', item));
    for (const item of report.limitations || []) limitations.appendChild(textElement('li', '', item));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const site = input.value.trim();
    if (!site) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Checking…';
    try {
      const response = await fetch('/readiness/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ site })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.detail || 'The quick audit could not be completed.');
      render(body);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The quick audit could not be completed.');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  for (const copy of document.querySelectorAll('.readiness-copy')) {
    copy.addEventListener('click', async () => {
      const id = copy.getAttribute('data-copy-target');
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent || '');
        const old = copy.textContent;
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = old; }, 1200);
      } catch {
        copy.textContent = 'Select text';
      }
    });
  }
})();
