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
  const v2Choice = document.getElementById('readiness-use-v2');

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function ensureHandoff() {
    let handoff = document.getElementById('readiness-handoff');
    if (handoff) return handoff;
    handoff = document.createElement('div');
    handoff.id = 'readiness-handoff';
    handoff.className = 'readiness-check readiness-handoff';
    output.appendChild(handoff);
    return handoff;
  }

  function renderHandoff(report) {
    const handoff = ensureHandoff();
    handoff.hidden = false;
    clear(handoff);

    const copy = document.createElement('div');
    const action = document.createElement('a');
    action.className = 'rv-button';

    if (report.verdict === 'NATIVE_READY') {
      handoff.appendChild(textElement('span', 'readiness-status pass', 'NATIVE FIRST'));
      copy.appendChild(textElement('b', '', 'Use the native freshness contract first.'));
      copy.appendChild(textElement('p', '', 'This surface result is not a SeenRelay recommendation. Honor the native mechanism; only measure a separate workload if agents still perform expensive repeated validation elsewhere.'));
      action.href = '#full';
      action.textContent = 'Review the full owner audit';
    } else if (report.verdict === 'NATIVE_FIX_RECOMMENDED') {
      handoff.appendChild(textElement('span', 'readiness-status fix', 'FIX NATIVE'));
      copy.appendChild(textElement('b', '', 'Fix the native surface before adding another reuse layer.'));
      copy.appendChild(textElement('p', '', 'Improve the authoritative HTTP or machine-facing contract first. Re-scan after the native fix; do not add SeenRelay just because this quick audit found a gap.'));
      action.href = '#full';
      action.textContent = 'See the owner-side checklist';
    } else {
      handoff.appendChild(textElement('span', 'readiness-status info', 'MEASURE NEXT'));
      copy.appendChild(textElement('b', '', 'A surface scan cannot decide SeenRelay workload fit.'));
      copy.appendChild(textElement('p', '', 'If agents repeatedly perform expensive read-only validation after equivalent native controls are tested, measure that real workload next with every authoritative call still enabled.'));
      action.href = '/#audit';
      action.textContent = 'Audit a real workload';
    }

    copy.appendChild(action);
    handoff.appendChild(copy);
  }

  function showError(message) {
    empty.hidden = true;
    output.hidden = false;
    verdict.className = 'readiness-verdict error';
    verdict.textContent = 'AUDIT NOT COMPLETED';
    headline.textContent = message;
    clear(checks); clear(next); clear(limitations);
    const handoff = document.getElementById('readiness-handoff');
    if (handoff) handoff.hidden = true;
  }

  function dimensionLabel(id) {
    return String(id || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (value) => value.toUpperCase());
  }

  function normalizeReport(payload) {
    if (payload?.protocol === 'seenrelay-site-audit-execution-v2' && payload.evidence?.report) {
      const report = payload.evidence.report;
      return {
        verdict: report.verdict,
        headline: `Extended machine-surface audit completed for ${report.targetOrigin || 'the submitted origin'}.`,
        checks: Object.entries(report.dimensions || {}).map(([id, item]) => ({
          id,
          status: item?.status || 'INFO',
          label: dimensionLabel(id),
          detail: item?.detail || ''
        })),
        next_steps: report.nextSteps || [],
        limitations: report.limitations || []
      };
    }
    return payload || {};
  }

  function render(payload) {
    const report = normalizeReport(payload);
    empty.hidden = true;
    output.hidden = false;
    verdict.className = `readiness-verdict ${String(report.verdict || '').toLowerCase()}`;
    verdict.textContent = report.verdict || 'UNKNOWN';
    headline.textContent = report.headline || '';
    clear(checks); clear(next); clear(limitations);

    for (const item of report.checks || []) {
      const card = document.createElement('div');
      card.className = 'readiness-check';
      const rawStatus = String(item.status || 'INFO');
      const visualStatus = rawStatus === 'NOT_APPLICABLE' ? 'INFO' : rawStatus;
      const labelStatus = rawStatus === 'NOT_APPLICABLE' ? 'N/A' : rawStatus;
      card.appendChild(textElement('span', `readiness-status ${visualStatus.toLowerCase()}`, labelStatus));
      const copy = document.createElement('div');
      copy.appendChild(textElement('b', '', item.label || 'Check'));
      copy.appendChild(textElement('p', '', item.detail || ''));
      card.appendChild(copy);
      checks.appendChild(card);
    }
    for (const item of report.next_steps || []) next.appendChild(textElement('li', '', item));
    for (const item of report.limitations || []) limitations.appendChild(textElement('li', '', item));
    renderHandoff(report);
  }

  function selectedEndpoint() {
    const v2Enabled = form.dataset.v2Enabled === 'true';
    if (v2Enabled && v2Choice?.checked) return form.dataset.v2Endpoint || '/readiness/audit/v2';
    return form.dataset.quickEndpoint || '/readiness/audit';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const site = input.value.trim();
    if (!site) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Checking…';
    try {
      const endpoint = selectedEndpoint();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ site })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.detail || 'The audit could not be completed.');
      render(body);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The audit could not be completed.');
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
