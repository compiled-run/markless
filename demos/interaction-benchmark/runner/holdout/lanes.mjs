// Holdout apps: realistic Markless apps nobody in the packed-delivery goal tuned against. The harness never
// edits them; it builds each with its own vite config, once as-is and once with markless() options forced
// through lib/markless-options-hook.mjs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export const VARIANTS = {
	default: null,
	packed: { experimentalNativePacking: true },
	// Opt-out comparison once packing becomes the framework default.
	unpacked: { experimentalNativePacking: false },
};

export const LANES = {
	'sr-app': {
		dir: 'packages/headless/sr-app',
		rendering: 'client-only (render() into #app), every shipped @markless/ui family',
		routes: ['/'],
		ready: '[data-gallery-ready="true"]',
	},
	'live-feed-ssr': {
		dir: 'demos/live-feed-ssr',
		rendering: 'SSR + router, async computed feed behind @try/@pending, keyed list',
		routes: ['/'],
		ready: '[data-feed-settled]',
	},
	'router-app': {
		dir: 'packages/router/fixtures/router',
		rendering:
			'SSR + router multi-route: TSRX pages, MDX catch-all with an interactive island, streamed @pending page, Link navigation',
		routes: ['/', '/harbor', '/docs/getting-started'],
		ready: null,
	},
};

/** Lanes resolved against `repo`: another checkout (an older revision) can be measured with this harness. */
export function selectLanes(names = Object.keys(LANES), repo = repoRoot) {
	return names.map((name) => {
		if (!LANES[name])
			throw new Error(`unknown lane "${name}" (known: ${Object.keys(LANES).join(', ')})`);
		return { name, ...LANES[name], root: path.join(repo, LANES[name].dir) };
	});
}
