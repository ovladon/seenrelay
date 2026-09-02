import fs from 'node:fs';
import { createHash } from 'node:crypto';

const POLICY_URL = new URL('../research/mcp-structural-replay-policy-v1.json', import.meta.url);
const POLICY_BYTES = fs.readFileSync(POLICY_URL);
const POLICY = JSON.parse(POLICY_BYTES.toString('utf8'));
const POLICY_FINGERPRINT = `sha256:${createHash('sha256').update(POLICY_BYTES).digest('hex')}`;

function stable(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('non-finite value');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  throw new TypeError('unsupported value');
}
function sha(v) { return `sha256:${createHash('sha256').update(typeof v === 'string' ? v : stable(v)).digest('hex')}`; }

function unwrapBash(command) {
  const prefix = '/bin/bash -lc ';
  if (typeof command !== 'string' || !command.startsWith(prefix)) return null;
  const outer = command.slice(prefix.length).trim();
  if (outer.length < 2) return null;
  const q = outer[0];
  if ((q !== "'" && q !== '"') || outer.at(-1) !== q) return null;
  const inner = outer.slice(1, -1);
  if (!inner.trim()) return null;
  return inner;
}

function splitTopLevel(script) {
  const segments = [];
  let buf = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < script.length; i += 1) {
    const ch = script[i];
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { buf += ch; escaped = true; continue; }
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    if (ch === '\n' || ch === '\r' || ch === ';' || ch === '>' || ch === '<' || ch === '(' || ch === ')' || ch === '`' || ch === '$') return null;
    if (ch === '&') {
      if (script[i + 1] !== '&') return null;
      if (!buf.trim()) return null;
      segments.push(buf.trim()); segments.push('&&'); buf = ''; i += 1; continue;
    }
    if (ch === '|') {
      if (script[i + 1] === '|') return null;
      if (!buf.trim()) return null;
      segments.push(buf.trim()); segments.push('|'); buf = ''; continue;
    }
    buf += ch;
  }
  if (quote || escaped || !buf.trim()) return null;
  segments.push(buf.trim());
  return segments;
}

function tokenize(segment) {
  const tokens = [];
  let buf = '';
  let quote = null;
  let escaped = false;
  const push = () => { if (buf.length) { tokens.push(buf); buf = ''; } };
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (ch === quote) quote = null; else buf += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (/\s/.test(ch)) { push(); continue; }
    buf += ch;
  }
  if (quote || escaped) return null;
  push();
  return tokens;
}

function localOperandSafe(token) {
  if (!token || token.startsWith('-')) return true;
  if (token.startsWith('/') || token === '..' || token.startsWith('../') || token.includes('/../')) return false;
  return true;
}

function commandIsReadOnly(tokens) {
  if (!tokens?.length) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) return false;
  const cmd = tokens[0];
  const args = tokens.slice(1);
  if (!['pwd','ls','cat','head','tail','wc','cut','tr','sort','rg','sed'].includes(cmd)) return false;
  if (args.some((x) => !localOperandSafe(x))) return false;
  if (cmd === 'pwd') return args.every((x) => x === '-L' || x === '-P');
  if (cmd === 'sort' && args.some((x, i) => x === '-o' || x === '--output' || x.startsWith('--output=') || (x === '-T' && i + 1 < args.length))) return false;
  if (cmd === 'rg' && args.some((x) => x === '--pre' || x.startsWith('--pre=') || x === '--hostname-bin' || x.startsWith('--hostname-bin='))) return false;
  if (cmd === 'sed') {
    if (args.some((x) => x === '-i' || x.startsWith('-i') || x === '--in-place' || x.startsWith('--in-place='))) return false;
    const scriptArgs = args.filter((x) => !x.startsWith('-'));
    if (!args.includes('-n') || scriptArgs.length < 1) return false;
    if (!/^\d+(?:,\d+)?p$/.test(scriptArgs[0])) return false;
  }
  return true;
}

export function classifyStructuralBashRead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.command !== 'string') return Object.freeze({ admitted: false, reason: 'input_shape' });
  const script = unwrapBash(input.command);
  if (script === null) return Object.freeze({ admitted: false, reason: 'wrapper' });
  const segments = splitTopLevel(script);
  if (!segments) return Object.freeze({ admitted: false, reason: 'shell_construct' });
  for (const segment of segments) {
    if (segment === '&&' || segment === '|') continue;
    const tokens = tokenize(segment);
    if (!commandIsReadOnly(tokens)) return Object.freeze({ admitted: false, reason: 'command_not_proven_read_only' });
  }
  return Object.freeze({ admitted: true, reason: 'proven_read_only_shape' });
}

export function replayMcpStructuralTrace(jsonl, options = {}) {
  if (typeof jsonl !== 'string' || !jsonl.trim()) throw new TypeError('jsonl must be non-empty string');
  if (options.expectedTraceSha256) {
    if (options.expectedTraceSha256 !== sha(jsonl)) throw new TypeError('trace sha256 mismatch');
  }
  const cache = new Map();
  const pending = new Map();
  let epoch = 0;
  let issuedToolCalls = 0;
  let baselineExecutions = 0;
  let candidateExecutions = 0;
  let policyEvaluations = 0;
  let admittedReadExecutions = 0;
  let predictedHits = 0;
  let verifiedEquivalentHits = 0;
  let mismatchHits = 0;
  let barriers = 0;
  let malformedEvents = 0;
  const candidateKeys = [];

  const barrier = () => { epoch += 1; cache.clear(); barriers += 1; };

  for (const rawLine of jsonl.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch { malformedEvents += 1; barrier(); continue; }
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') { malformedEvents += 1; barrier(); continue; }

    if (event.type === 'tool-call') {
      issuedToolCalls += 1;
      baselineExecutions += 1;
      candidateExecutions += 1;
      policyEvaluations += 1;
      const id = typeof event.toolCallId === 'string' ? event.toolCallId : null;
      if (!id || pending.has(id)) { malformedEvents += 1; barrier(); continue; }

      if (event.toolName === 'bash') {
        const classification = classifyStructuralBashRead(event.input);
        if (classification.admitted) {
          admittedReadExecutions += 1;
          const key = sha({ tool_name: 'bash', input: event.input });
          const prior = cache.get(key);
          const predictedHit = Boolean(prior && prior.epoch === epoch);
          if (predictedHit) {
            predictedHits += 1;
            candidateExecutions -= 1;
            candidateKeys.push(key);
          }
          pending.set(id, { kind: 'read', key, epoch, predictedHit, priorOutputSha: prior?.outputSha ?? null });
          continue;
        }
      }
      pending.set(id, { kind: 'barrier', epoch });
      barrier();
      continue;
    }

    if (event.type === 'tool-result') {
      const id = typeof event.toolCallId === 'string' ? event.toolCallId : null;
      const p = id ? pending.get(id) : null;
      if (!p) continue;
      pending.delete(id);
      if (p.kind !== 'read') continue;
      const outputSha = sha(event.output);
      if (p.predictedHit) {
        if (outputSha === p.priorOutputSha) verifiedEquivalentHits += 1;
        else mismatchHits += 1;
      } else if (p.epoch === epoch) {
        cache.set(p.key, { epoch, outputSha });
      }
      continue;
    }

    if (event.type === 'tool-error') {
      const id = typeof event.toolCallId === 'string' ? event.toolCallId : null;
      if (id) pending.delete(id);
      barrier();
    }
  }

  const unresolvedReads = [...pending.values()].filter((p) => p.kind === 'read').length;
  const sameOutcomeProof = malformedEvents === 0 && unresolvedReads === 0 && mismatchHits === 0 && predictedHits === verifiedEquivalentHits;
  const structuralReductionPercent = baselineExecutions === 0 ? 0 : ((baselineExecutions - candidateExecutions) / baselineExecutions) * 100;
  const envelope = {
    schema: 'seenrelay-mcp-structural-trace-replay-v1',
    policy_fingerprint: POLICY_FINGERPRINT,
    issued_tool_calls: issuedToolCalls,
    baseline_executed_tool_calls: baselineExecutions,
    candidate_executed_tool_calls: candidateExecutions,
    policy_evaluations: policyEvaluations,
    admitted_read_executions: admittedReadExecutions,
    predicted_cache_hits: predictedHits,
    verified_equivalent_hits: verifiedEquivalentHits,
    mismatch_hits: mismatchHits,
    barriers: barriers,
    malformed_events: malformedEvents,
    unresolved_read_calls: unresolvedReads,
    same_outcome_structural_proof: sameOutcomeProof,
    structural_execution_reduction_percent: structuralReductionPercent,
    candidate_key_fingerprints: [...candidateKeys].sort(),
  };
  return Object.freeze({
    ...envelope,
    evidence_class: POLICY.evidence_class,
    current_result_used_for_decision: false,
    decision_overhead_scalarized: false,
    structural_reduction_descriptive_only: true,
    vector_candidate_authorized: false,
    economic_value_proven: false,
    attention_microkernel_authorized: false,
    active_optimizer_authorized: false,
    production_change_authorized: false,
    raw_commands_retained: false,
    raw_outputs_retained: false,
    proof_fingerprint: sha(envelope),
  });
}

export { POLICY_FINGERPRINT };
