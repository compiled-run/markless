export interface RouterAnalyzerNetworkRule {
	readonly method: 'GET';
	readonly origin: 'fixture';
	readonly path: string | RegExp;
	readonly reason: string;
}

const BUILD_MODULE = /^\/build\/[^?#]+\.js$/;

/** E1: every browser-observed request in the built router fixture is declared here. */
export const routerAnalyzerPolicy = {
	network: {
		router: [
			{ method: 'GET', origin: 'fixture', path: '/', reason: 'home route document' },
			{
				method: 'GET',
				origin: 'fixture',
				path: '/docs/getting-started',
				reason: 'direct MDX route document',
			},
			{
				method: 'GET',
				origin: 'fixture',
				path: '/harbor',
				reason: 'streaming route document',
			},
			{ method: 'GET', origin: 'fixture', path: '/missing', reason: '404 route document' },
			{
				method: 'GET',
				origin: 'fixture',
				path: BUILD_MODULE,
				reason: 'built route, navigation, resume, and interaction modules',
			},
		] as readonly RouterAnalyzerNetworkRule[],
	},
	pending: { allow: false as const },
	crossOrigin: { allow: false as const },
	exceptions: [] as const,
	executedBytes: {
		enforcementDeferred:
			'owner-approved 2026-07-13: MDX m0 runtime attribution IDs remain unknown; runtime-management follow-up owns measurement, ratification, and I5 enforcement',
	},
};
