from pathlib import Path
p = Path('src/public-facts-view.ts')
s = p.read_text()
old = """      const m = item.matrix;
      const cost = m.cost_outcome === 'better' ? '↓ better' : m.cost_outcome === 'worse' ? '↑ worse' : m.cost_outcome;
      const latency = m.latency_outcome === 'better' ? '↓ better' : m.latency_outcome === 'worse' ? '↑ worse' : m.latency_outcome;
      const fit = m.fit === 'good' ? 'GOOD' : m.fit === 'conditional' ? 'CONDITIONAL' : String(m.fit).toUpperCase();"""
new = """      const m = item.matrix;
      const costOutcome = String(m.cost_outcome);
      const latencyOutcome = String(m.latency_outcome);
      const fitValue = String(m.fit);
      const cost = costOutcome === 'better' ? '↓ better' : costOutcome === 'worse' ? '↑ worse' : costOutcome;
      const latency = latencyOutcome === 'better' ? '↓ better' : latencyOutcome === 'worse' ? '↑ worse' : latencyOutcome;
      const fit = fitValue === 'good' ? 'GOOD' : fitValue === 'conditional' ? 'CONDITIONAL' : fitValue.toUpperCase();"""
if old not in s:
    raise SystemExit('generic matrix outcome block missing')
p.write_text(s.replace(old, new, 1))
print('Widened display-only outcome values without weakening evidence schema.')
