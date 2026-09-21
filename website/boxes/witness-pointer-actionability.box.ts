import { createHash } from 'node:crypto';
import { box } from '@async/witness';

const fixture = `<!doctype html><html data-pointer-fixture="native-actionability"><head><style>
html { scroll-behavior: smooth; }
body { margin: 0; }
#root { margin-top: 1600px; width: 180px; height: 60px; }
#scroller { height: 180px; overflow: auto; scroll-behavior: smooth; }
#nested { display: block; margin-top: 900px; width: 90px; height: 110px; }
#descendant { display: block; width: 160px; height: 60px; }
#descendant span { display: block; width: 100%; height: 100%; }
#blocked { width: 160px; height: 60px; }
#cover { position: absolute; inset: 0; background: silver; }
</style></head><body>
<output id="state">none</output>
<button id="root">Root</button>
<div id="scroller"><button id="nested">Nested</button></div>
<button id="descendant"><span>Child receiver</span></button>
<div style="position:relative;width:160px;height:60px"><button id="blocked">Blocked</button><div id="cover">Cover</div></div>
<output id="blocked-state">untouched</output>
<script>
for (const id of ['root', 'nested', 'descendant']) {
 document.getElementById(id).addEventListener('click', event => {
  document.getElementById('state').textContent = id + ':' + event.isTrusted;
 });
}
for (const id of ['blocked', 'cover']) {
 document.getElementById(id).addEventListener('click', () => {
  document.getElementById('blocked-state').textContent = id;
 });
}
</script></body></html>`;

export default box(
	{ name: 'native pointer actionability', tags: ['browser'], modes: ['dev'] },
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				server: { ...config.server, watch: null },
				plugins: [...(config.plugins ?? []), {
					name: 'pointer-actionability-fixture',
					configureServer: {
						order: 'pre',
						handler(server) {
						server.middlewares.use((request, response, next) => {
							if (request.url !== '/markless/__pointer-fixture') return next();
							response.setHeader('Content-Type', 'text/html');
							response.end(fixture);
						});
						},
					},
				}],
			}),
		});
		const page = await browser.visit('/markless/__pointer-fixture');
		try {
			const content = await page.content();
			const documents = (await page.networkRequests()).filter((request) => request.resourceType === 'Document');
			const admitted = documents.length === 1 && documents[0]?.status === 200
				&& documents[0]?.mimeType === 'text/html'
				&& content.includes('data-pointer-fixture="native-actionability"')
				&& content.includes('id="root"') && content.includes('id="nested"');
			receipt.note(JSON.stringify({ fixtureAdmission: admitted, documents,
				servedSha256: createHash('sha256').update(content).digest('hex') }));
			if (!admitted) throw new Error('Native fixture document admission failed');
			for (const id of ['root', 'nested', 'descendant']) {
				await page.click('#' + id, { timeoutMs: 3000 });
				await expect.page.text(page, '#state', id + ':true', { timeoutMs: 3000 });
			}
			let failure: unknown;
			try {
				await page.click('#blocked', { timeoutMs: 1000 });
			} catch (error) {
				failure = error;
			}
			if (!(failure instanceof Error) || !/timed out|timeout/i.test(failure.message)) {
				throw new Error('Occluded center did not produce an actionability timeout');
			}
			await expect.page.text(page, '#blocked-state', 'untouched');
			await receipt.capture('native actionability complete');
		} catch (error) {
			try { await receipt.capture('native actionability failure'); }
			catch (captureError) { console.error('Failure capture failed', captureError); }
			throw error;
		}
	},
);
