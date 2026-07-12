export type BundlerAnalyzerFixtureId =
	| 'vite-csr-preloader'
	| 'vite-ssr-preloader'
	| 'vite-csr-debug-channel'
	| 'vite-ssr-debug-channel';

export interface BundlerAnalyzerBudget {
	readonly bootstrapMeasuredBytes: number | null;
	readonly actionMeasuredBytes: number | null;
	readonly bootstrapCeilingBytes: number | null;
	readonly actionCeilingBytes: number | null;
	readonly authority: string;
	readonly measurementCitation: string | null;
	// Owner-approved enforcement deferral (dated). While set, the I5 gate is
	// pending - the box runs all other assertions and analyzer stages, and a
	// follow-up card owns measurement + ratification + removing this flag.
	readonly enforcementDeferred?: string;
}

export interface BundlerAnalyzerNetworkRule {
	readonly method: 'GET';
	readonly origin: 'fixture';
	readonly path: string | RegExp;
	readonly reason: string;
}

export interface BundlerAnalyzerException {
	readonly invariant: 'MLA-I1-CONSOLE' | 'MLA-I2-NETWORK';
	readonly reason: string;
	readonly owner: string;
	readonly expires: string;
}

const BUILD_MODULE = /^\/build\/[^?#]+\.js$/;

/** E1: every request made by the adopted fixtures is declared here. */
export const bundlerAnalyzerPolicy = {
	pending: { allow: false as const },
	crossOrigin: { allow: false as const },
	exceptions: [] as readonly BundlerAnalyzerException[],
	network: {
		'vite-csr-preloader': [
			{ method: 'GET', origin: 'fixture', path: '/', reason: 'fixture document' },
			{
				method: 'GET',
				origin: 'fixture',
				path: '/build/bundle-graph.json',
				reason: 'fixture-owned preload manifest',
			},
			{ method: 'GET', origin: 'fixture', path: BUILD_MODULE, reason: 'built module' },
		],
		'vite-ssr-preloader': [
			{ method: 'GET', origin: 'fixture', path: '/', reason: 'fixture document' },
			{ method: 'GET', origin: 'fixture', path: BUILD_MODULE, reason: 'built module' },
		],
	} satisfies Record<
		'vite-csr-preloader' | 'vite-ssr-preloader',
		readonly BundlerAnalyzerNetworkRule[]
	>,
	budgets: {
		'vite-csr-preloader': {
			bootstrapMeasuredBytes: null,
			actionMeasuredBytes: null,
			bootstrapCeilingBytes: null,
			actionCeilingBytes: null,
			authority: 'OWNER-RATIFICATION-REQUIRED: fresh V8 coverage measurement',
			measurementCitation: null,
			enforcementDeferred:
				'owner-approved 2026-07-12: I5 measurement mode blocked on a CDP-vs-witness runner conflict; follow-up card owns measurement, ratification, and enforcement',
		},
		'vite-ssr-preloader': {
			bootstrapMeasuredBytes: null,
			actionMeasuredBytes: null,
			bootstrapCeilingBytes: null,
			actionCeilingBytes: null,
			authority: 'OWNER-RATIFICATION-REQUIRED: fresh V8 coverage measurement',
			measurementCitation: null,
			enforcementDeferred:
				'owner-approved 2026-07-12: I5 measurement mode blocked on a CDP-vs-witness runner conflict; follow-up card owns measurement, ratification, and enforcement',
		},
	} satisfies Record<'vite-csr-preloader' | 'vite-ssr-preloader', BundlerAnalyzerBudget>,
};
