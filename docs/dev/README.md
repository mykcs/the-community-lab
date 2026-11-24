# Dev · The Community Lab

This is the project-specific **development route**, not a substitute for the [original Wish](../wish/README.md) or official-score evidence.

- **Actual implementation:** [package.json](../../package.json) (npm run check, npm run build, Astro/Tailwind application) and source under src/, lib/, data/.
- **Current CI reality:** [verify.yml](../../.github/workflows/verify.yml) performs path-scoped PR/main checks; [pages.yml](../../.github/workflows/pages.yml) builds and publishes GitHub Pages from main. These are live code/config owners; a passing build is not proof of scoring parity or user-account security.
- **Truth/acceptance:** [verification matrix](../VERIFICATION-MATRIX.md), [translation standards](../TRANSLATION-STANDARD.md), and [deployment notes](../DEPLOYMENT.md); preserve evidence that AI translation and official scoring parity are not fully confirmed.
- **Current work and collisions:** [Current](../agents/current/README.md), [PRs](https://github.com/mykcs/the-community-lab/pulls) and [Issues](https://github.com/mykcs/the-community-lab/issues).
- **Shared Dev contract:** [mykcs/.agents](https://github.com/mykcs/.agents/blob/main/docs/agents/DEV_PROTOCOL.md).

Do not start hosting bills, data collection, OAuth/database writes or publication of unverified official scores based on this Dev route.

## Website acceptance map

| Area | Current owner |
| --- | --- |
| Reader | `src/lib/agent-reader.mjs`, `e2e/agent-reader.spec.mjs`; follow the verification matrix, not unsupported official claims. |
| Design | [Sitewide design](../workstreams/SITEWIDE-DESIGN-20261120.md), `src/styles/tokens.css`, `npm run check:design`. |
| Responsive | Existing desktop, 440×956 DPR3 touch and targeted WebKit/standalone browser tests. |
| Expression | Wish, translation and verification owners above; retain original evidence and nonofficial/unknown limits. |
| Engineering | `npm ci && npm run check && npm run build`, existing static/offline validation. |
| CI | Existing verify/browser-qa/Pages jobs; no additional hosting provider; compare the exact tested commit and Pages receipt. |
| Public output | Existing approved source/translation boundaries; never submit real answer vectors, credentials or private reviewer records in tests. |
| Accessibility/performance | Browser QA, accessible controls, keyboard, contrast, overflow and measured page behavior; unrun checks remain unverified. |
| Governance | AGENTS and this Dev route point to existing Wish, evidence and local checks. |

This table maps the existing project authorities, not a certification of all pages.
