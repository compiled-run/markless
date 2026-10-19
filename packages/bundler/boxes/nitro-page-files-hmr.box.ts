import { box } from '@async/witness';
import { MARKLESS_DEV_PAGE_EDIT_EVENT } from '../src/dev-error/index.ts';

const FIXTURE = 'fixtures/vite-nitro';
const COUNTER = `${FIXTURE}/components/counter.tsrx`;
const NOTES = `${FIXTURE}/pages/notes.tsrx`;
const WAIT = { timeoutMs: 20_000 };
const PORT = 51734;

export default box(
	{
		name: 'nitro dev hmr: a page file added or removed is routed live, and an edit reloads only the pages it reaches',
		tags: ['nitro', 'ssr', 'hmr', 'browser', 'routes'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, environment, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				// Its own strict port, off the owner's dev server and off the other nitro boxes'.
				server: { ...config.server, port: PORT, strictPort: true },
			}),
		});

		const home = await browser.visit('/');
		await expect.page.text(home, '[data-counter]', 'Count 0', WAIT);
		await expect.response.matches(await environment.client.fetch('/notes'), { status: 404 });

		// Adding a page changes every page's route table, so every open page reloads.
		await home.click('[data-counter]', WAIT);
		await expect.page.text(home, '[data-counter]', 'Count 1', WAIT);
		await project.edit.create(
			NOTES,
			'export default function Notes() @{\n\t<main><h1 data-notes>Notes ready</h1></main>\n}\n',
		);
		await expect.page.text(home, '[data-counter]', 'Count 0', WAIT);
		await expect.page.outcome(home, { navigations: 1 }, WAIT);
		const notes = await browser.visit('/notes');
		await expect.page.text(notes, '[data-notes]', 'Notes ready', WAIT);

		// The counter is imported by the home page only, so the notes tab keeps its document.
		const counterEdit = await project.edit(COUNTER, {
			replace: ['Count {count}', 'Clicks {count}'],
		});
		await expect.page.text(home, '[data-counter]', 'Clicks 0', WAIT);
		await expect.page.outcome(home, { navigations: 2 }, WAIT);
		await expect.edit(
			counterEdit,
			{ client: { hmr: 'none', messages: [MARKLESS_DEV_PAGE_EDIT_EVENT] } },
			WAIT,
		);

		const notesEdit = await project.edit(NOTES, { replace: ['Notes ready', 'Notes edited'] });
		await expect.page.text(notes, '[data-notes]', 'Notes edited', WAIT);
		await expect.page.outcome(notes, { navigations: 1 }, WAIT);
		await expect.edit(
			notesEdit,
			{ client: { hmr: 'none', messages: [MARKLESS_DEV_PAGE_EDIT_EVENT] } },
			WAIT,
		);
		await expect.page.outcome(home, { navigations: 2 }, WAIT);

		// Removing a page changes every page's route table, so every open page reloads.
		await home.click('[data-counter]', WAIT);
		await expect.page.text(home, '[data-counter]', 'Clicks 1', WAIT);
		await project.edit.remove(NOTES);
		await expect.page.text(home, '[data-counter]', 'Clicks 0', WAIT);
		await expect.response.matches(await environment.client.fetch('/notes'), { status: 404 });
		await expect.page.bodyText(notes, { notContains: 'Notes edited' }, WAIT);
		await expect.page.outcome(notes, { navigations: 2 }, WAIT);
		await expect.page.outcome(home, { navigations: 3 }, WAIT);
		await receipt.capture('after the added page was removed');
	},
);
