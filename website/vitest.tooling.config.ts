// The site's build plugins are tested as plain modules: loaded into the test server, router() starts a Nitro dev server that keeps the run from exiting.
export default {
	root: import.meta.dirname,
	test: {
		name: 'website-tooling',
		include: [
			'tooling/**/*.test.ts',
			'components/figures/**/*.test.ts',
			'components/docs/code/worker-sources.test.ts',
			'components/docs/navbar/*.test.ts',
			'components/docs/search/*.test.ts',
			'components/docs/ink-card/*.test.ts',
		],
		// kit.test.ts server-renders a .tsrx component, which needs the Markless plugin this config leaves out; run it with the site's own config.
		exclude: ['components/figures/kit/**', '**/node_modules/**'],
	},
};
