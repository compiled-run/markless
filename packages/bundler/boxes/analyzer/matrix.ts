import type { BundlerAnalyzerFixtureId } from './policy.ts';

export interface BundlerAnalyzerSurface {
	readonly fixture: BundlerAnalyzerFixtureId;
	readonly surfaces: readonly (
		| 'MLA-S1-PRELOAD-INTEGRITY'
		| 'MLA-S4-STRIP-GUARANTEE'
		| 'MLA-I1-CONSOLE'
		| 'MLA-I2-NETWORK'
		| 'MLA-I5-BOOTSTRAP-BUDGET'
		| 'MLA-I5-ACTION-BUDGET'
		| 'MLA-EXT-WITNESS'
	)[];
}

export const bundlerAnalyzerMatrix: readonly BundlerAnalyzerSurface[] = [
	{
		fixture: 'vite-csr-preloader',
		surfaces: [
			'MLA-S1-PRELOAD-INTEGRITY',
			'MLA-I1-CONSOLE',
			'MLA-I2-NETWORK',
			'MLA-I5-BOOTSTRAP-BUDGET',
			'MLA-I5-ACTION-BUDGET',
			'MLA-EXT-WITNESS',
		],
	},
	{
		fixture: 'vite-ssr-preloader',
		surfaces: [
			'MLA-S1-PRELOAD-INTEGRITY',
			'MLA-I1-CONSOLE',
			'MLA-I2-NETWORK',
			'MLA-I5-BOOTSTRAP-BUDGET',
			'MLA-I5-ACTION-BUDGET',
			'MLA-EXT-WITNESS',
		],
	},
	{
		fixture: 'vite-csr-debug-channel',
		surfaces: ['MLA-S4-STRIP-GUARANTEE', 'MLA-EXT-WITNESS'],
	},
	{
		fixture: 'vite-ssr-debug-channel',
		surfaces: ['MLA-S4-STRIP-GUARANTEE', 'MLA-EXT-WITNESS'],
	},
] as const;
