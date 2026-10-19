import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-nitro';
const COMPONENT = `${FIXTURE}/components/counter.tsrx`;
const UNRELATED = `${FIXTURE}/components/unrelated.tsrx`;
const BADGE = `${FIXTURE}/components/badge.tsrx`;
const WAIT = { timeoutMs: 20_000 };
const PORT = 51732;

const component = (name: string, marker: string) =>
	`export default function ${name}() @{\n\t<em ${marker}>${name.toLowerCase()} ready</em>\n}\n`;

export default box(
	{
		name: 'nitro dev hmr: a new .tsrx file no page imports reloads no page',
		tags: ['nitro', 'ssr', 'hmr', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				// Its own strict port, off the owner's dev server and off the other nitro box's.
				server: { ...config.server, port: PORT, strictPort: true },
			}),
		});

		const page = await browser.visit('/');
		await expect.page.text(page, '[data-counter]', 'Count 0', WAIT);

		// The shape of a code-block file a page's first compile writes: nothing loaded imports it.
		const unrelated = await project.edit.create(
			UNRELATED,
			component('Unrelated', 'data-unrelated'),
		);
		await expect.edit(unrelated, { client: { hmr: 'none' } }, WAIT);
		await expect.page.outcome(page, { navigations: 0 }, WAIT);

		const badge = await project.edit.create(BADGE, component('Badge', 'data-badge'));
		await expect.edit(badge, { client: { hmr: 'none' } }, WAIT);
		await expect.page.outcome(page, { navigations: 0 }, WAIT);

		// Once the page imports the new file, edits to either one reach it.
		await project.edit(COMPONENT, (code) =>
			code
				.replace(
					"import { state } from '@markless/core';",
					"import { state } from '@markless/core';\nimport Badge from './badge.tsrx';",
				)
				.replace('\t</section>', '\t\t<Badge />\n\t</section>'),
		);
		await expect.page.text(page, '[data-badge]', 'badge ready', WAIT);
		await expect.page.outcome(page, { navigations: 1 }, WAIT);

		await project.edit(BADGE, { replace: ['badge ready', 'badge edited'] });
		await expect.page.text(page, '[data-badge]', 'badge edited', WAIT);
		await expect.page.outcome(page, { navigations: 2 }, WAIT);
		await receipt.capture('after the imported new file was edited');
	},
);
