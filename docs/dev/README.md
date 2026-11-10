# Dev · The Community Lab

This is the project-specific **development route**, not a substitute for the [original Wish](../wish/README.md) or official-score evidence.

- **Actual implementation:** [package.json](../../package.json) (npm run check, npm run build, Astro/Tailwind application) and source under src/, lib/, data/.
- **Current CI reality:** [verify.yml](../../.github/workflows/verify.yml) performs path-scoped PR/main checks; [pages.yml](../../.github/workflows/pages.yml) builds and publishes GitHub Pages from main. These are live code/config owners; a passing build is not proof of scoring parity or user-account security.
- **Truth/acceptance:** [verification matrix](../VERIFICATION-MATRIX.md), [translation standards](../TRANSLATION-STANDARD.md), and [deployment notes](../DEPLOYMENT.md); preserve evidence that AI translation and official scoring parity are not fully confirmed.
- **Current work and collisions:** [Current](../agents/current/README.md), [PRs](https://github.com/mykcs/the-community-lab/pulls) and [Issues](https://github.com/mykcs/the-community-lab/issues).
- **Shared Dev contract:** [mykcs/.agents](https://github.com/mykcs/.agents/blob/main/docs/agents/DEV_PROTOCOL.md).

Do not start hosting bills, data collection, OAuth/database writes or publication of unverified official scores based on this Dev route.
