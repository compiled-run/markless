# Markless entrant, retired `viewport` variant (lab only)

This copy of the Markless entrant (`demos/interaction-benchmark/apps/markless`) used to build with
`router({ linkPreloading: 'viewport' })`. That option no longer exists: the router has one automatic
navigation behaviour (fragment navigation with intent and a gated idle fetch), and `prefetch={false}`
is its only setting. `vite.config.ts` now matches the default entrant, so this app measures the
same thing and is not listed on the benchmark site. It stays in the tree only as a lab copy for
side-by-side runs on another port.

| Setting | Default entrant | This copy |
| --- | --- | --- |
| `router()` (`vite.config.ts`) | no options | no options |
| `package.json` name | `markless-interaction-bench` | `markless-viewport-interaction-bench` |
| Serve / smoke port | 4410 | 4415 |

## Commands

Run from `demos/interaction-benchmark/apps/markless-viewport` after `pnpm install` at the repo
root: `pnpm run build`, `pnpm run start` (port 4415), `PORT=<port> pnpm run smoke`. Runner target:
`markless-viewport` (lab only).
