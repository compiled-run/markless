export interface MusicSsrNetworkRule {
	readonly method: 'GET';
	readonly origin: 'fixture' | 'https://www.youtube.com' | 'https://i.ytimg.com';
	readonly path: string | RegExp;
	readonly reason: string;
}

const BUILD_ASSET = /^\/build\/[^?#]+$/;
const STYLE_ASSET = /^\/assets\/[^?#]+\.css$/;

/** E1: YouTube's iframe API is declared exactly; every other third-party request is denied. */
export const musicSsrAnalyzerPolicy = {
	pending: { allow: false as const },
	crossOrigin: { allow: false as const },
	exceptions: [] as const,
	network: [
		{ method: 'GET', origin: 'fixture', path: '/', reason: 'SSR route document' },
		{
			method: 'GET',
			origin: 'fixture',
			path: BUILD_ASSET,
			reason: 'built route assets and execution size map',
		},
		{ method: 'GET', origin: 'fixture', path: STYLE_ASSET, reason: 'built stylesheet' },
		{
			method: 'GET',
			origin: 'https://www.youtube.com',
			path: '/iframe_api',
			reason: 'player command adapter loads the declared YouTube iframe API',
		},
		{
			method: 'GET',
			origin: 'https://www.youtube.com',
			path: /^\/s\/player\/[^?#]+\.js$/,
			reason: 'the iframe API bootstraps its own widget internals on player init',
		},
		{
			method: 'GET',
			origin: 'https://i.ytimg.com',
			path: /^\/vi\/[^?#]+\/maxresdefault\.jpg$/,
			reason: 'track covers are the declared YouTube thumbnail assets (src/data.ts)',
		},
		{
			method: 'GET',
			origin: 'fixture',
			path: '/favicon.ico',
			reason: 'browser-automatic favicon probe against the fixture origin',
		},
	] as readonly MusicSsrNetworkRule[],
	executedBytes: {
		enforcementDeferred:
			'owner-approved 2026-07-12: no fresh SSR V8 coverage baselines exist for the separate Play and Next windows; follow-up measurement and ratification own I5 enforcement',
	},
};
