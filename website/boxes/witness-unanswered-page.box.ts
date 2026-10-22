import { box } from '@async/witness';

const fixture = `<!doctype html><html><body>
<button id="freeze">Freeze</button>
<output id="state">idle</output>
<script>
document.getElementById('freeze').addEventListener('click', () => {
 setTimeout(() => { for (;;) {} }, 50);
});
</script></body></html>`;

// A page whose main thread stops answering fails the waiting assertion with that cause, not the box watchdog minutes later.
export default box(
	{ name: 'a page that stops answering fails its assertion', tags: ['browser'], modes: ['dev'] },
	async ({ pipeline, browser, expect }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				server: { ...config.server, watch: null },
				plugins: [
					...(config.plugins ?? []),
					{
						name: 'unanswered-page-fixture',
						configureServer: {
							order: 'pre',
							handler(server) {
								server.middlewares.use((request, response, next) => {
									if (request.url !== '/__unanswered-fixture') return next();
									response.setHeader('Content-Type', 'text/html');
									response.end(fixture);
								});
							},
						},
					},
				],
			}),
		});
		const page = await browser.visit('/__unanswered-fixture');
		await page.click('#freeze', { timeoutMs: 3000 });
		const started = Date.now();
		let failure: unknown;
		try {
			await expect.page.text(page, '#state', 'never', { timeoutMs: 1000 });
		} catch (error) {
			failure = error;
		}
		const elapsed = Date.now() - started;
		if (!(failure instanceof Error) || !failure.message.includes('the page stopped answering'))
			throw new Error(`A frozen page did not fail its assertion with that cause: ${String(failure)}`);
		if (elapsed > 20_000)
			throw new Error(`A frozen page took ${elapsed}ms to fail its assertion`);
	},
);
