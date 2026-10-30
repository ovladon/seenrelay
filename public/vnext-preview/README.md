# SeenRelay vNext — isolated public design prototype

This folder is a **design-only candidate**, not the live homepage, a new API, or a Production feature launch. It contains no service route modification, no new dependency, no billing change, no source fetching, and no marketplace activation.

## Objective

- Preserve a recognizable dark technical SeenRelay identity while improving semantic color contrast, typography, hierarchy and spacing.
- Make one human journey immediately clear: understand -> try locally -> inspect actual evidence -> keep only when warranted.
- Treat machine interfaces as first-class, with explicit links to the CURRENT public service, adoption, OpenAPI and Agent Skill descriptors.
- Demonstrate future hierarchical observed-change concepts only as clearly labeled simulation.

## Initial design tokens (candidate, not fully certified)

Background #0B1017; surface #121B26; raised #182536; text #F4F7FB; supporting text #B6C4D3; jade #61E4BC; information blue #79B5F8; caution #F2BD7C; failure #F18E8E; borders #293748.

Preliminary WCAG relative luminance calculations show primary/secondary/jade/blue/amber/coral text contrasts above 7:1 against the background/surface candidates. This does NOT certify the full resulting interface's contrast, states, focus, mobile or typography.

## Promotion blockers

- Finish mobile viewport, keyboard, reduced-motion, 200% zoom, focus indicator, touch/hover and accessibility audit.
- Test all required destination links and agent installation *from deployed preview*, including the currently known Agent Skill canonical-byte mismatch.
- Verify that interactive simulation cannot be mistaken for real source observations, customer savings, marketplace trading, or predictions.
- A2 evidence, A4 privacy/reliability, A12 no-regression and A13 design review. A10 owns implementation.
- Preserve all existing served site routes, machine descriptors, CHECK/OBSERVE, SDKs, admin and rollback.
- Do not change the real homepage route until founder-specific Production promotion authority after preview tests.

## Next work

Replace the static prototype with integrated full-site page templates and shared design tokens in an isolated branch. Build automated screenshot and accessibility baselines; confirm actual self-serve and agent flows, refine with usability evidence, and stage a reversible website cutover.

## Expanded isolated agent journey (2026-10-30)

- agents.html adds a consistent second preview page: canonical machine discovery, local scan, native-first controls, CHECK/OBSERVE status boundaries and explicit rejection of unverified source-value delivery.
- guide.css reuses existing semantic theme tokens; no new third-party dependencies or network operations.
- Preview homepage navigation now links to the new agent page. Existing /agents, /clients, /proof, /trust and machine endpoints remain unchanged.
- Still requires visual/mobile/keyboard/Agent Skill install-byte end-to-end verification before any Production decision.

## Opening the redesigned preview (reviewer instructions)

The root homepage of the CURRENT Production deployment remains unchanged by design. The Vercel `seenrelay` deployment for THIS pull request/branch must be opened, not the separate `seenrelay-readiness` check. With Vercel system environment variables exposed, opening its `/` route in a browser now returns a temporary redirect to `/vnext-preview/index.html`, while non-HTML calls to `/` still receive the current machine service descriptor. Other preview branches and Production remain on the existing homepage.

To bypass the homepage router when verifying static assets, append `/vnext-preview/index.html` to the Vercel deployment host. The accompanying `/vnext-preview/agents.html` is the second standalone design page. If Vercel system variables are not exposed, branch-only redirect will NOT activate; use the direct static path and check deployment configuration. Vercel Authentication may require the authorized project owner to sign in; do not weaken deployment protection for design review.

New `tests/site-vnext-isolated-preview-route.test.mjs` checks that the branch-only redirect is scoped and the existing production HTML and machine-descriptor fallbacks remain in the source. Full visual/mobile/keyboard QA remains a separate promotion blocker.
