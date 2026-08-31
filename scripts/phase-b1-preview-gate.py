from pathlib import Path

p = Path('scripts/preview-release-gate.sh')
text = p.read_text()
old = """grep -q 'VALIDATION COST AVOIDANCE' /tmp/site.html
grep -q 'Avoid redundant expensive validation' /tmp/site.html
grep -q 'Works without shared network data' /tmp/site.html"""
new = """client_version=$(node -p \"require('./public/product-facts.json').install.client_version\")
grep -q 'VALIDATION INFRASTRUCTURE' /tmp/site.html
grep -q \"Don't pay twice for the same validation\" /tmp/site.html
grep -q 'Two commands. Start without an account.' /tmp/site.html
grep -q \"CLIENT v${client_version} VERIFIED\" /tmp/site.html
grep -q 'GOOD CANDIDATE' /tmp/site.html
grep -q 'NEGATIVE CONTROL' /tmp/site.html
grep -q 'No truth oracle' /tmp/site.html
grep -q 'No fake provenance' /tmp/site.html
grep -q 'Agent Skill' /tmp/site.html"""
assert old in text
text = text.replace(old, new, 1)
old = """grep -q 'npm install seenrelay' /tmp/site.html
grep -q 'pip install seenrelay' /tmp/site.html
grep -q '3/3 provider calls avoided' /tmp/site.html
grep -q '15 credits avoided' /tmp/site.html
grep -q 'Path ordering matters' /tmp/site.html"""
new = """grep -q 'npm install seenrelay' /tmp/site.html
grep -q 'pip install seenrelay' /tmp/site.html
grep -q 'MEASURED EVIDENCE' /tmp/site.html
grep -q 'provider-path calls avoided' /tmp/site.html
grep -q 'Every row keeps its caveat and source.' /tmp/site.html
grep -q 'data-stat=\"facts\"' /tmp/site.html"""
assert old in text
text = text.replace(old, new, 1)
old = """curl -fsS \"${bypass[@]}\" \"$PREVIEW_URL/llms.txt\" -o /tmp/llms.txt
grep -q 'npm install seenrelay' /tmp/llms.txt
grep -q 'pip install seenrelay' /tmp/llms.txt
grep -q 'Avoid redundant expensive validation' /tmp/llms.txt
grep -q 'Shared CHECK is off by default' /tmp/llms.txt"""
new = """curl -fsS \"${bypass[@]}\" -H 'accept: text/html' \"$PREVIEW_URL/quickstart\" -o /tmp/quickstart.html
curl -fsS \"${bypass[@]}\" -H 'accept: text/html' \"$PREVIEW_URL/clients\" -o /tmp/clients.html
grep -q \"JavaScript/TypeScript ${client_version}\" /tmp/quickstart.html
grep -q \"CLIENT ${client_version}\" /tmp/clients.html
! grep -q '0.2.1' /tmp/quickstart.html
! grep -q '0.2.1' /tmp/clients.html
curl -fsS \"${bypass[@]}\" \"$PREVIEW_URL/llms.txt\" -o /tmp/llms.txt
grep -q 'npm install seenrelay' /tmp/llms.txt
grep -q 'pip install seenrelay' /tmp/llms.txt
grep -q \"JavaScript/TypeScript ${client_version} uses\" /tmp/llms.txt
grep -q \"Python ${client_version} remains shadow-first\" /tmp/llms.txt
! grep -q '0.2.1' /tmp/llms.txt
grep -q 'Shared CHECK is off by default' /tmp/llms.txt"""
assert old in text
text = text.replace(old, new, 1)
p.write_text(text)

t = Path('tests/site-phase-b1.test.mjs')
text = t.read_text()
old = "const adoptionSource = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');\nconst css"
new = "const adoptionSource = fs.readFileSync(new URL('../src/adoption.ts', import.meta.url), 'utf8');\nconst previewGate = fs.readFileSync(new URL('../scripts/preview-release-gate.sh', import.meta.url), 'utf8');\nconst css"
assert old in text
text = text.replace(old, new, 1)
text += r'''

test('preview release gate validates Phase B.1 semantics instead of obsolete homepage copy', () => {
  assert.match(previewGate, /VALIDATION INFRASTRUCTURE/);
  assert.match(previewGate, /CLIENT v\$\{client_version\} VERIFIED/);
  assert.match(previewGate, /GOOD CANDIDATE/);
  assert.match(previewGate, /NEGATIVE CONTROL/);
  assert.match(previewGate, /No truth oracle/);
  assert.match(previewGate, /quickstart\.html/);
  assert.match(previewGate, /clients\.html/);
  assert.doesNotMatch(previewGate, /VALIDATION COST AVOIDANCE/);
});
'''
t.write_text(text)
