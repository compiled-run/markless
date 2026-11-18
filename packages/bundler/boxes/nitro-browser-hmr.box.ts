import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-nitro';
const COMPONENT = `${FIXTURE}/components/counter.tsrx`;
const WAIT = { timeoutMs: 20_000 };

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
				// A port the system picks free: a fixed one can be in use, as another process's outgoing connection.
				server: { ...config.server, port: 0 },
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
		// keeps serving the old markup however often the browser reloads. A visit served before the
		// watcher sees the edit reloads when its client connects, even after the reload went out.
		const second = await browser.visit('/');
		await expect.page.text(second, '[data-counter-added]', 'counter added', WAIT);
		await expect.page.text(page, '[data-counter-added]', 'counter added', WAIT);
		await receipt.capture('after structural component edit on a nitro-served page');
	},
);
