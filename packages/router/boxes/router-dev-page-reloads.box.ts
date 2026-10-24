import { box } from '@async/witness';
import { MARKLESS_DEV_PAGE_EDIT_EVENT } from '../../bundler/src/dev-error/index.ts';

const FIXTURE = 'fixtures/router';
const HOME_PAGE = `${FIXTURE}/pages/index.tsrx`;
const DOCS_COUNTER = `${FIXTURE}/components/InteractiveCounter.tsrx`;
const DOCUMENT = `${FIXTURE}/document.tsrx`;
const HOME_COUNTER = '[data-home-counter]';
const MDX_COUNTER = '[data-mdx-counter]';
const DOCS_LINK = 'a[data-markless-router-link]';
const PAGE_EDIT = { client: { hmr: 'none' as const, messages: [MARKLESS_DEV_PAGE_EDIT_EVENT] } };
const WAIT = { timeoutMs: 20_000 };

export default box(
	{
		name: 'router dev: an edit reloads only the open pages whose page module imports it',
		tags: ['router', 'dev', 'browser', 'hmr'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const docs = await browser.visit('/docs/getting-started');
		await docs.click(MDX_COUNTER, WAIT);
		await expect.page.text(docs, MDX_COUNTER, 'MDX Count 1', WAIT);
		const home = await browser.visit('/');
		await home.click(HOME_COUNTER, WAIT);
		await expect.page.text(home, HOME_COUNTER, 'Button 1', WAIT);

		// Only the docs page imports the counter component.
		const counterEdit = await project.edit(DOCS_COUNTER, {
			replace: ['MDX Count {count}', 'MDX Clicks {count}'],
		});
		await expect.page.text(docs, MDX_COUNTER, 'MDX Clicks 0', WAIT);
		await expect.page.outcome(docs, { navigations: 1 }, WAIT);
		await expect.edit(counterEdit, PAGE_EDIT, WAIT);

		const homeEdit = await project.edit(HOME_PAGE, {
			replace: ['Button {count}', 'Tap {count}'],
		});
		// One home reload so far: the counter edit left the home page alone.
		await expect.page.text(home, HOME_COUNTER, 'Tap 0', WAIT);
		await expect.page.outcome(home, { navigations: 1 }, WAIT);
		await expect.edit(homeEdit, PAGE_EDIT, WAIT);
		// The home edit must leave the docs page alone: a reload here would also swallow the click below.
		await expect.page.outcome(docs, { navigations: 1 }, WAIT);
		await docs.click(MDX_COUNTER, WAIT);
		await expect.page.text(docs, MDX_COUNTER, 'MDX Clicks 1', WAIT);

		// A page reached by in-place navigation reloads for edits to the page it shows now.
		await home.click(DOCS_LINK, WAIT);
		await expect.page.text(home, 'h1', 'Docs', WAIT);
		await home.click(MDX_COUNTER, WAIT);
		await expect.page.text(home, MDX_COUNTER, 'MDX Clicks 1', WAIT);
		const secondCounterEdit = await project.edit(DOCS_COUNTER, {
			replace: ['MDX Clicks {count}', 'MDX Taps {count}'],
		});
		await expect.page.text(home, MDX_COUNTER, 'MDX Taps 0', WAIT);
		await expect.page.text(docs, MDX_COUNTER, 'MDX Taps 0', WAIT);
		await expect.page.outcome(docs, { navigations: 2 }, WAIT);
		await expect.edit(secondCounterEdit, PAGE_EDIT, WAIT);

		// Every page renders inside the document, so an edit to it reloads them all.
		await docs.click(MDX_COUNTER, WAIT);
		await home.click(MDX_COUNTER, WAIT);
		await expect.page.text(docs, MDX_COUNTER, 'MDX Taps 1', WAIT);
		await expect.page.text(home, MDX_COUNTER, 'MDX Taps 1', WAIT);
		const documentEdit = await project.edit(DOCUMENT, {
			replace: [
				'<link rel="icon" href="data:," />',
				'<link rel="icon" href="data:,edited" />',
			],
		});
		await expect.page.text(docs, MDX_COUNTER, 'MDX Taps 0', WAIT);
		await expect.page.text(home, MDX_COUNTER, 'MDX Taps 0', WAIT);
		await expect.page.outcome(docs, { navigations: 3, consoleErrors: 0 }, WAIT);
		await expect.edit(documentEdit, { client: { hmr: 'full-reload' } }, WAIT);
		await receipt.capture('after the shared document edit reloaded both pages');
	},
);
