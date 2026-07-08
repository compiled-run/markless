import { createServer } from 'node:http';
import { box } from '@async/witness';

// T107 out-of-order streaming proof (D5/D6): the harbor fixture's forecast
// computed is deliberately slower (300ms) than the first-flush deadline, so
// the SAME document response must flush the @pending arm first, stay open,
// and append the settled arm as an inert <template m:arm> + records +
// state-patch + __mArm call. After the runtime wakes, the streamed arm's
// button must be interactive. A fully BUFFERED copy of the response must
// still render settled content (the executor commits on parse) — streaming
// degrades gracefully behind buffering proxies.

const FIXTURE = 'fixtures/router';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-streaming';
// Nested under .output/ so the isolated nitro artifacts stay gitignored.
const NITRO_OUTPUT_DIR = '.output/router-streaming';
const WAIT = { timeoutMs: 10_000 };
const ARRIVAL = '[data-harbor-arrival]';
const LOG_BUTTON = '[data-harbor-log]';
const TALLY = '[data-harbor-logged]';
const MIN_SETTLE_GAP_MS = 150;

export default box(
	{
		name: 'router streaming: pending flushes first, settled arm commits out of order and resumes interactive',
		tags: ['router', 'build', 'preview', 'browser', 'streaming'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});
		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});
		try {
			// (1) One response, streamed: capture chunk timings from the wire.
			const { chunks, text } = await streamDocument(new URL('/harbor', preview.url));
			const pendingAt = chunkTime(chunks, 'data-harbor-waiting');
			const templateAt = chunkTime(chunks, '<template m:arm=');
			if (pendingAt === null || templateAt === null) {
				throw new Error(
					`Streamed /harbor document must flush the pending arm and a settled template; saw pending@${String(pendingAt)}ms template@${String(templateAt)}ms.`,
				);
			}
			if (templateAt - pendingAt < MIN_SETTLE_GAP_MS) {
				throw new Error(
					`Settled template flushed ${String(templateAt - pendingAt)}ms after the pending shell; expected >= ${String(MIN_SETTLE_GAP_MS)}ms (the fixture settles server-side at ~300ms).`,
				);
			}
			receipt.note(
				`chunk timing: pending shell @${String(pendingAt)}ms, settled template @${String(templateAt)}ms, ${String(chunks.length)} chunks on one response`,
			);

			// (5) Served shapes: inert template, records, incremental snapshot,
			// once-installed executor, and the ordinary inline resumer.
			await expect.html.contains(text, 'data-markless-stream-executor');
			await expect.html.contains(text, '<template m:arm="');
			await expect.html.contains(text, '<script type="markless/arm" data-boundary="');
			await expect.html.contains(text, '<script type="markless/state-patch" data-graph-node="');
			await expect.html.contains(text, '__mArm(');
			await expect.html.contains(text, 'data-async-resumer');
			if (text.indexOf('data-harbor-waiting') > text.indexOf('<template m:arm=')) {
				throw new Error('Pending arm bytes must precede the settled template in the stream.');
			}

			// (2) Real browser: the settled arm committed between the boundary's
			// own anchors (no pending corpse, template consumed on commit).
			const page = await preview.browser.visit('/harbor');
			await expect.page.text(page, 'h1', 'Harbor arrivals', WAIT);
			await expect.page.text(page, ARRIVAL, 'Petrel at berth 7Log arrival', WAIT);
			const settledDom = await page.content();
			if (settledDom.includes('data-harbor-waiting')) {
				throw new Error('Pending arm must be REPLACED by the streamed settle, not hidden.');
			}
			if (/<template[^>]*m:arm/.test(settledDom)) {
				throw new Error('The inert streamed template must be consumed by the commit.');
			}

			// (3) Interactive after wake: the streamed in-arm button writes state
			// the shell's tally renders.
			await expect.page.text(page, TALLY, 'Logged 0', WAIT);
			await page.click(LOG_BUTTON, WAIT);
			await expect.page.text(page, TALLY, 'Logged 1', WAIT);
			await page.click(LOG_BUTTON, WAIT);
			await expect.page.text(page, TALLY, 'Logged 2', WAIT);

			// (4) Exactly one document request carried the whole story.
			const documentRequests = (await page.networkRequests()).filter(
				(request) => request.resourceType === 'Document',
			);
			if (documentRequests.length !== 1) {
				throw new Error(
					`Expected a single streamed document request, saw:\n${documentRequests
						.map((request) => `${request.method} ${request.url}`)
						.join('\n')}`,
				);
			}
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

			// (6) Graceful degradation: the fully buffered document (as a
			// buffering proxy would deliver it) still renders settled content —
			// the executor commits on parse.
			const buffered = await serveBufferedCopy(text);
			try {
				const bufferedPage = await preview.browser.visit(buffered.url);
				await expect.page.text(bufferedPage, ARRIVAL, 'Petrel at berth 7Log arrival', WAIT);
				const bufferedDom = await bufferedPage.content();
				if (bufferedDom.includes('data-harbor-waiting')) {
					throw new Error('Buffered streamed document must still show settled content.');
				}
				receipt.note('buffered single-write copy rendered settled content (executor commits on parse)');
			} finally {
				buffered.close();
			}

			receipt.note(
				'out-of-order settle observed: pending painted from the open stream, settled arm committed from a later-flushed inert template, interactive after wake',
			);
		} finally {
			await preview.close();
		}
		await receipt.capture('router streaming settled a slow boundary out of order on one response');
	},
);

function isolatedNitroOutput() {
	return {
		buildDir: NITRO_BUILD_DIR,
		output: {
			dir: NITRO_OUTPUT_DIR,
			publicDir: `${NITRO_OUTPUT_DIR}/public`,
			serverDir: `${NITRO_OUTPUT_DIR}/server`,
		},
	};
}

type TimedChunk = { readonly atMs: number; readonly text: string };

async function streamDocument(url: URL): Promise<{ chunks: TimedChunk[]; text: string }> {
	const started = Date.now();
	const response = await fetch(url);
	if (!response.ok || response.body === null) {
		throw new Error(`GET ${url.pathname} returned HTTP ${String(response.status)}.`);
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const chunks: TimedChunk[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push({ atMs: Date.now() - started, text: decoder.decode(value, { stream: true }) });
	}
	return { chunks, text: chunks.map((chunk) => chunk.text).join('') };
}

function chunkTime(chunks: readonly TimedChunk[], marker: string): number | null {
	const chunk = chunks.find((candidate) => candidate.text.includes(marker));
	return chunk ? chunk.atMs : null;
}

// A one-route static server delivering the captured document in a single
// write: exactly what a buffering proxy in front of the app would serve.
async function serveBufferedCopy(text: string): Promise<{ url: string; close: () => void }> {
	const server = createServer((_request, response) => {
		response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
		response.end(text);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Buffered-copy server did not report a port.');
	}
	return {
		url: `http://127.0.0.1:${String(address.port)}/harbor-buffered`,
		close: () => server.close(),
	};
}
