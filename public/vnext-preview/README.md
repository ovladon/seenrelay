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

The current Production homepage and the root route of this Vercel branch deployment intentionally remain identical. The existing Preview Release Gate verifies these public onboarding/proof contracts, machine discovery, billing-disabled behavior and safety. The isolated design is NOT promoted to `/` until those requirements are carried over and tested.

Open the `Vercel – seenrelay` deployment for this pull request (NOT `seenrelay-readiness`), then navigate directly to:

- `/vnext-preview/index.html` — redesign homepage and clearly labeled future fingerprint-map simulation.
- `/vnext-preview/agents.html` — integrated agent-first design experiment.

As verified by the Preview Release Gate workflow's URL-resolution log, the PR preview deployment host for 2026-10-30 was `https://seenrelay-git-a10-site-vnext-iso-22eb44-ovladonn-9636s-projects.vercel.app`. For that deployment, the full candidate homepage URL is `https://seenrelay-git-a10-site-vnext-iso-22eb44-ovladonn-9636s-projects.vercel.app/vnext-preview/index.html`. A later deployment may assign a different host; use its current GitHub check status if so. If Vercel Authentication blocks access, use the project owner's authorized sign-in and do not weaken protection.

The regression test `tests/site-vnext-isolated-preview-route.test.mjs` checks that the canonical root route remains intact and candidate static assets exist. Vercel/CI checks alone do NOT replace visual, responsive, contrast, keyboard, or end-to-end agent installation testing.
