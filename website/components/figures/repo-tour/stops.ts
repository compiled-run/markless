// The repo tour's stops and side packages: names, real paths and files, and the one sentence each shows under the drawing.
export type P = [number, number];

/** The stops, in the order map.tsrx meets them. Paths and files are real (checked by repo-tour.test.ts); the last stop is the browser. */
export const STOPS = [
	{ name: 'core', path: 'packages/core/src/', files: ['framework-api.ts', 'vite.ts', 'render.ts'], says: "You import state from core. Its Vite plugin, the bundler's, hands map.tsrx to the compiler." },
	{ name: 'compiler', path: 'packages/compiler/src/', files: ['compile-module.ts', 'collect-diagnostics.ts', 'diagnostics.ts'], says: 'The compiler cuts map.tsrx into pieces: its state, its updates and the code each click runs.' },
	{ name: 'bundler', path: 'packages/bundler/src/', files: ['compile-store.ts', 'dev.ts', 'build/bundle-graph.ts'], says: 'The bundler packs the pieces into chunks, for the dev server and the build.' },
	{ name: 'router', path: 'packages/router/src/', files: ['route-manifest.ts', 'vite/runtime/create-server-entry.ts', 'navigate.ts'], says: 'The router matches /map to pages/map.tsrx and renders it on the server.' },
	{ name: 'serializer', path: 'packages/serializer/src/', files: ['payload-scripts.ts', 'protocol-client.ts'], says: "The serializer writes the page's state next to its HTML." },
	{ name: 'web', path: 'packages/web/src/', files: ['payload-resume.ts', 'event-resume.ts', 'render-to-stream.ts'], says: 'Web resumes the page on the first click, without running map.tsrx again.' },
	{ name: 'runtime', path: 'packages/runtime/src/', files: ['graph.ts', 'graph-computed.ts', 'graph-scheduler.ts'], says: 'The runtime keeps pin up to date, and repaints only the spots that read it.' },
	{ name: 'browser', path: 'localhost:3000/map', files: [], says: 'The page is live: change pin, and only the heading repaints.' },
];

/** Packages beside the route, each joined to the stop it leans on. */
export const SIDES = [
	{ name: 'create-markless', at: 0, end: [1.3, 0.55] as P, does: 'create-markless makes a new app from one of four starters.' },
	{ name: 'ui', at: 0, end: [4.2, 5.15] as P, does: '@markless/ui: headless, accessible components, built on core.' },
	{ name: 'typescript-plugin', at: 1, end: [7.7, 0.55] as P, does: '@markless/typescript-plugin gives your editor .tsrx support, using the compiler.' },
	{ name: 'vitest-browser', at: 5, end: [12.9, 9.6] as P, does: '@markless/vitest-browser renders components in browser tests, with core and web.' },
	{ name: 'analyzer', at: 7, end: [2.9, 9.6] as P, does: '@markless/analyzer checks a running app in the browser: errors, requests and budgets.' },
];

