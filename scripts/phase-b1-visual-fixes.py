from pathlib import Path

landing = Path('src/landing.ts')
text = landing.read_text()
repls = {
    "<meta property=\"og:title\" content=\"SeenRelay — Don't pay twice for the same validation\">": "<meta property=\"og:title\" content=\"SeenRelay — Avoid paying twice for the same validation\">",
    "<h1>Don't pay twice for the same validation.</h1>": "<h1>Avoid paying twice for the same validation.</h1>",
    "<code>${origin}/mcp</code>": "<code>/mcp</code>",
    "<article><span>02</span><h3>No hidden research</h3><p>The hosted service does not browse, search or independently verify arbitrary facts on demand.</p></article>": "<article><span>02</span><h3>No hidden browsing</h3><p>The hosted service does not browse, search or independently verify arbitrary facts on demand.</p></article>",
}
for old, new in repls.items():
    assert old in text, old
    text = text.replace(old, new, 1)
landing.write_text(text)

css = Path('public/site.css')
text = css.read_text()
old = "@media(max-width:700px){.topbar{height:60px;padding-left:16px;padding-right:16px}.nav-cta{font-size:9px}.hero-shell,.section,.final-cta{padding-left:16px;padding-right:16px}.hero-shell{padding-top:58px;padding-bottom:54px}.hero-copy h1{font-size:52px}.hero-lead{font-size:17px}.proof-strip{grid-template-columns:1fr 1fr}.band{grid-template-columns:1fr;padding:0 16px}"
new = "@media(max-width:700px){.topbar{height:60px;padding-left:16px;padding-right:16px}.nav-cta{font-size:9px}.hero-shell,.section,.final-cta{padding-left:16px;padding-right:16px}.hero-shell{padding-top:58px;padding-bottom:54px}.hero-copy h1{font-size:52px}.hero-lead{font-size:17px}.proof-strip{grid-template-columns:1fr 1fr}.proof-strip div:last-child{grid-column:1/-1}.band{grid-template-columns:1fr;padding:0 16px}"
assert old in text
text = text.replace(old, new, 1)
old = ".evidence-footer,.final-cta,footer{display:grid}.final-cta{padding-top:70px;padding-bottom:70px}.latest-grid{gap:6px}}"
new = ".evidence-footer,.final-cta,footer{display:grid}.final-cta{grid-template-columns:1fr;padding-top:70px;padding-bottom:70px}.latest-grid{gap:6px}}"
assert old in text
text = text.replace(old, new, 1)
css.write_text(text)

preview = Path('scripts/preview-release-gate.sh')
text = preview.read_text()
old = "grep -q \"Don't pay twice for the same validation\" /tmp/site.html"
new = "grep -q 'Avoid paying twice for the same validation' /tmp/site.html"
assert old in text
preview.write_text(text.replace(old, new, 1))

tests = Path('tests/site-phase-b1.test.mjs')
text = tests.read_text()
text = text.replace("assert.match(landing, /No hidden research/i);", "assert.match(landing, /No hidden browsing/i);")
old = "  assert.match(css, /focus-visible/);\n});"
new = "  assert.match(css, /focus-visible/);\n  assert.match(css, /proof-strip div:last-child\\{grid-column:1\\/-1\\}/);\n  assert.match(css, /final-cta\\{grid-template-columns:1fr/);\n});"
assert old in text
text = text.replace(old, new, 1)
tests.write_text(text)
