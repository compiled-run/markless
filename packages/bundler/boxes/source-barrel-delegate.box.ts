import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'source barrel components update after leaf and export edits',
		tags: ['ssr', 'hmr', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await project.edit('prepare source barrel composition', {
			[`${FIXTURE}/src/root.tsrx`]:
				() => `import * as controls from './source-barrel/index.ts';
export function App() @{
<section><controls.counter /></section>
}`,
			[`${FIXTURE}/src/source-barrel/index.ts`]: {
				create: `export { Counter as counter } from './counter.tsrx';\nthrow new Error('Do not execute the component barrel');\n`,
			},
			[`${FIXTURE}/src/source-barrel/counter.tsrx`]: {
				create: `import { state } from '@markless/core';
export function Counter() @{
let count = state(0);
<button data-barrel-count onClick={() => count++}>first {count}</button>
}`,
			},
			[`${FIXTURE}/src/source-barrel/other.tsrx`]: {
				create: `import { state } from '@markless/core';
export function Alternate() @{
let value = state(10);
<button data-barrel-count onClick={() => value += 2}>alternate {value}</button>
}`,
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
		await expect.page.text(page, '[data-barrel-count]', 'first 0', WAIT);
		await page.click('[data-barrel-count]', WAIT);
		await expect.page.text(page, '[data-barrel-count]', 'first 1', WAIT);
		await project.edit(`${FIXTURE}/src/source-barrel/counter.tsrx`, {
			replace: ['first {count}', 'updated {count}'],
		});
		await expect.page.text(page, '[data-barrel-count]', 'updated 0', WAIT);
		await page.click('[data-barrel-count]', WAIT);
		await expect.page.text(page, '[data-barrel-count]', 'updated 1', WAIT);
		await project.edit(`${FIXTURE}/src/source-barrel/index.ts`, {
			replace: [
				"Counter as counter } from './counter.tsrx'",
				"Alternate as counter } from './other.tsrx'",
			],
		});
		await receipt.capture('barrel export edited; automatic refresh pending');
		await expect.page.text(page, '[data-barrel-count]', 'alternate 10', WAIT);
		await page.click('[data-barrel-count]', WAIT);
		await expect.page.text(page, '[data-barrel-count]', 'alternate 12', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('source barrel leaf and export target updates preserve interaction');
	},
);
