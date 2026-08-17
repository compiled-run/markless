import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-nitro';
const COMPONENT = `${FIXTURE}/components/counter.tsrx`;
const WAIT = { timeoutMs: 20_000 };
const PORT = 51731;

export default box(
	{
		name: 'nitro browser hmr: structural component edit reaches the served page',
		tags: ['nitro', 'ssr', 'hmr', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				// A fixed high strict port keeps this box off the owner's dev server
				// (3000) so a red here can never be someone else's page.
				server: { ...config.server, port: PORT, strictPort: true },
			}),
		});

		const page = await browser.visit('/');
		await expect.page.text(page, '[data-counter]', 'Count 0', WAIT);

		await project.edit(COMPONENT, {
			replace: [
				'\t</section>',
				'\t\t<em data-counter-added>counter added</em>\n\t</section>',
			],
		});

		// A brand-new request has to render the edited component too: the nitro
		// environment renders pages from its own module runner, and a stale runner
		// keeps serving the old markup however often the browser reloads.
		const second = await browser.visit('/');
		await expect.page.text(second, '[data-counter-added]', 'counter added', WAIT);
		await expect.page.text(page, '[data-counter-added]', 'counter added', WAIT);
		await receipt.capture('after structural component edit on a nitro-served page');
	},
);
