import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr render data hmr: independent controls resume after a nested child changes',
		tags: ['ssr', 'hmr', 'browser', 'child-state'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await project.edit('prepare nested decoration and independent controls', {
			[`${FIXTURE}/src/root.tsrx`]: () => `import { state, storage } from '@markless/core';
import Caption from './Caption.tsrx';

export function App() @{
	let count = state(0);
	let tone = storage('render-data-tone', 'light');

	<section>
		<button data-counter onClick={() => count++}>{count}</button>
		<button data-tone onClick={() => tone = tone === 'light' ? 'dark' : 'light'}>{tone}</button>
		<Caption />
	</section>
}
`,
			[`${FIXTURE}/src/Caption.tsrx`]: {
				create: `import Badge from './Badge.tsrx';
export default function Caption() @{
	<p><Badge /></p>
}
`,
			},
			[`${FIXTURE}/src/Badge.tsrx`]: {
				create: `export default function Badge() @{
	<span data-badge>first</span>
}
`,
			},
		});

		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		const page = await browser.visit('/');
		await expect.page.text(page, '[data-badge]', 'first', WAIT);
		await page.click('[data-counter]', WAIT);
		await expect.page.text(page, '[data-counter]', '1', WAIT);
		await page.click('[data-tone]', WAIT);
		await expect.page.text(page, '[data-tone]', 'dark', WAIT);

		const textEdit = await project.edit(`${FIXTURE}/src/Badge.tsrx`, {
			replace: ['first', 'second'],
		});
		await expect.edit(textEdit, { client: { hmr: 'full-reload' } }, WAIT);
		await expect.page.text(page, '[data-badge]', 'second', WAIT);
		await expect.page.text(page, '[data-counter]', '0', WAIT);
		await page.click('[data-counter]', WAIT);
		await expect.page.text(page, '[data-counter]', '1', WAIT);
		await page.click('[data-tone]', WAIT);
		await expect.page.text(page, '[data-tone]', 'light', WAIT);

		const structureEdit = await project.edit(`${FIXTURE}/src/Badge.tsrx`, {
			replace: ['<span data-badge>second</span>', '<em data-badge>third</em>'],
		});
		await expect.edit(structureEdit, { client: { hmr: 'full-reload' } }, WAIT);
		await expect.page.text(page, 'em[data-badge]', 'third', WAIT);
		await page.click('[data-counter]', WAIT);
		await expect.page.text(page, '[data-counter]', '1', WAIT);
		await page.click('[data-tone]', WAIT);
		await expect.page.text(page, '[data-tone]', 'dark', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('counter and persisted control resume after nested child edits');
	},
);
