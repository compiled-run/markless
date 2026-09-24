# Markless entrant, `viewport` link preloading variant

A labeled variant of the Markless entrant (`demos/interaction-benchmark/apps/markless`). The app
source is a copy of that app; read its `BENCH.md` for versions, rendering mode, app shape and the
contract notes. Only the settings below differ.

| Setting | Default entrant | This variant |
| --- | --- | --- |
| `router({ linkPreloading })` (`vite.config.ts`) | `'intent'` | `'viewport'` |
| `package.json` name | `markless-interaction-bench` | `markless-viewport-interaction-bench` |
| Serve / smoke port | 4410 | 4415 |

What `'viewport'` adds on top of `'intent'`: once the page's own modulepreloads have finished
(after `load`, or after the first input, whichever comes first) and the browser is idle, links on
screen download their destination's navigation files as `modulepreload` with
`fetchpriority="low"`, at most two at a time. Nothing is executed. Each new pointer or key input
pauses the queue until the page is idle again. Save-Data and 2g connections skip it. Links rendered
by later client navigations join the same queue.

## Commands

Run from `demos/interaction-benchmark/apps/markless-viewport` after `pnpm install` at the repo
root: `pnpm run build`, `pnpm run start` (port 4415), `PORT=<port> pnpm run smoke`. Runner target:
`markless-viewport` (entrant `markless`, variant `viewport`).
