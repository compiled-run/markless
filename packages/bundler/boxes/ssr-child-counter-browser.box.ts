import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const COUNTER = '[data-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr child counter browser: imported BUTTON counter resumes click',
		tags: ['ssr', 'dev', 'browser', 'child-state'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await project.edit('prepare imported child BUTTON counter fixture', {
			[`${FIXTURE}/src/root.tsrx`]: () => `import { Counter } from './Counter.tsrx';

export function App() @{
\t<section>
\t\t<Counter />
\t\t<span>hello</span>
\t</section>
}
`,
			[`${FIXTURE}/src/Counter.tsrx`]: {
				create: `import { state } from 'arcade';

export function Counter() @{
\tlet count = state(0);

\t<button data-counter onClick={() => count++}>BUTTON {count}</button>
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

		await expect.page.text(page, COUNTER, 'BUTTON 0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, 'BUTTON 1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('ssr imported child BUTTON counter resumed click');
	},
);
