import { defineConfig } from 'vite-plus';

// Witness-only observation channel. The box API exposes assertions over the DOM
// and over page outcomes, but not over console text, and the fact under test IS
// the number of console lines one render turn prints. This build mirrors that
// count onto <html data-render-log-lines>, changing nothing else: the counter is
// a classic inline script, so it is not a module the execution log accounts for.
const RENDER_LOG_LINE_COUNTER = [
	'(function () {',
	'\tvar lines = 0;',
	'\tvar log = console.log;',
	'\tconsole.log = function () {',
	"\t\tvar first = arguments[0];",
	// Render turns are the only ledger lines that reach console.log: interaction
	// turns open a collapsed group instead, so this still counts render turns
	// only, exactly as the 'markless: rendered' prefix did before the ledger.
	"\t\tif (typeof first === 'string' && first.indexOf('markless: ') === 0 && first.indexOf('executed at load') > 0) {",
	'\t\t\tlines++;',
	"\t\t\tdocument.documentElement.setAttribute('data-render-log-lines', String(lines));",
	'\t\t}',
	'\t\treturn log.apply(console, arguments);',
	'\t};',
	'})();',
].join('\n');

export default defineConfig(async () => {
	process.env.MARKLESS_PRERENDER = '1';
	const { musicPlayerConfig } = await import('../vite.config.ts');
	const config = musicPlayerConfig('auto');
	return {
		...config,
		plugins: [
			...config.plugins,
			{
				name: 'witness-render-log-line-counter',
				transformIndexHtml: {
					order: 'post' as const,
					handler: () => [
						{
							tag: 'script',
							injectTo: 'head-prepend' as const,
							children: RENDER_LOG_LINE_COUNTER,
						},
					],
				},
			},
		],
	};
});
