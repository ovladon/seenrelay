(() => {
  'use strict';
  const buttons = [...document.querySelectorAll('[data-state]')];
  const status = (id, changed) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.textContent = changed ? 'CHANGED' : 'MATCH';
    target.classList.toggle('changed', changed);
    target.classList.toggle('stable', !changed);
  };
  const render = (mode) => {
    const changed = mode === 'changed';
    for (const b of buttons) {
      const active = b.dataset.state === mode;
      b.setAttribute('aria-pressed', String(active));
      b.classList.toggle('is-active', active);
    }
    status('commercial-status', changed);
    status('price-status', changed);
    status('stock-status', false);
    status('technical-status', changed);
    status('ram-status', changed);
    status('color-status', false);
    const root = document.querySelector('.panel-head .hash');
    if (root) root.textContent = changed ? 'root:a1c9…' : 'root:f8b6…';
    const verdict = document.getElementById('demo-verdict');
    if (verdict) {
      verdict.textContent = changed
        ? 'Price changed between observations and affects this agent’s declared decision. RAM also changed but is not required here. Revalidate price-dependent conclusions using an authorized source; the hash does not reveal the new price.'
        : 'No monitored dependency changed in the two observed snapshots. Existing conclusions may remain compatible, subject to freshness and assurance.';
      verdict.style.color = changed ? 'var(--amber)' : 'var(--jade)';
    }
  };
  buttons.forEach((button) => button.addEventListener('click', () => render(button.dataset.state)));
  render('same');

  const copy = document.getElementById('copy-command');
  copy?.addEventListener('click', async () => {
    const output = document.getElementById('copy-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText('npx seenrelay scan');
      if (output) output.textContent = 'Command copied. Run it in a terminal where Node.js and npm are available.';
    } catch {
      if (output) output.textContent = 'Clipboard unavailable. Select and copy the command displayed above.';
    }
  });
})();
