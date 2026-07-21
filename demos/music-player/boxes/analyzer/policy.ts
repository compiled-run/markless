export type MusicCsrFixtureId = 'csr-command-state' | 'csr-play-branch' | 'csr-library-toggle';

export interface MusicCsrNetworkRule {
	readonly method: 'GET';
	readonly origin: 'fixture' | 'https://www.youtube.com' | 'https://i.ytimg.com';
	readonly path: string | RegExp;
	readonly reason: string;
}

const BUILD_MODULE = /^\/build\/[^?#]+\.js$/;
const STYLE_ASSET = /^\/assets\/[^?#]+\.css$/;

/** E1: YouTube's iframe API is declared exactly; every other third-party request is denied. */
export const musicCsrAnalyzerPolicy = {
	pending: { allow: false as const },
	crossOrigin: { allow: false as const },
	exceptions: [] as const,
	network: [
		{ method: 'GET', origin: 'fixture', path: '/', reason: 'CSR document' },
		{ method: 'GET', origin: 'fixture', path: BUILD_MODULE, reason: 'built module' },
		{ method: 'GET', origin: 'fixture', path: STYLE_ASSET, reason: 'built stylesheet' },
		{
			method: 'GET',
			origin: 'fixture',
			path: '/build/execution-sizes.json',
			reason: 'localhost-gated dev-log instrument loads the attribution scope tables',
		},
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
	] as readonly MusicCsrNetworkRule[],
	executedBytes: {
		enforcementDeferred:
			'owner-approved 2026-07-12: no fresh CSR V8 coverage baseline exists; follow-up measurement and ratification own I5 enforcement',
	},
};
