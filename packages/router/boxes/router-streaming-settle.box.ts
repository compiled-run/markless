import { createServer } from 'node:http';
import { box } from '@async/witness';
import {
	marklessSsrAttachSnapshots,
	marklessSsrRunAsyncComputed,
} from '@markless/web/fns/ssr';
import { renderToStream } from '@markless/web/render-to-stream';

// T107 out-of-order streaming proof (D5/D6): the harbor fixture's forecast
// computed is deliberately slower (300ms) than the first-flush deadline, so
// the SAME document response must flush the @pending arm first, stay open,
// and append the settled arm as an inert <template m:arm> + records +
// state-patch + __mArm call. After the runtime wakes, the streamed arm's
// button must be interactive. A fully BUFFERED copy of the response must
// still render settled content (the executor commits on parse) — streaming
// degrades gracefully behind buffering proxies.
//
// T113 reveal choreography: a second, in-box multi-boundary page (the router
// fixture stays single-boundary) proves the reveal-train semantics against a
// real top-level document: pending shell flushes first, settled templates
// stream in dependency order, the first reveal honors the minimum pending
// visibility after first contentful paint (G2), later arrivals join the next
// train one cadence later (G1), and same-train commits land together in
// dependency order (C3 read-set edges carried by __mArm).

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

			// (7) T113 reveal choreography, multi-boundary: an in-box page served
			// through the production renderToStream over a genuinely chunked
			// response. Three boundaries: gauge (450ms), chart (600ms), reef
			// (630ms, read-set edge onto chart).
			const reveal = await serveRevealTrainPage();
			try {
				const wire = await streamDocument(new URL('/reveal', reveal.url));
				const shellAt = chunkTime(wire.chunks, 'data-waiting="reef"');
				const gaugeAt = chunkTime(wire.chunks, '<template m:arm="reveal:0"');
				const chartAt = chunkTime(wire.chunks, '<template m:arm="reveal:1"');
				const reefAt = chunkTime(wire.chunks, '<template m:arm="reveal:2"');
				if (shellAt === null || gaugeAt === null || chartAt === null || reefAt === null) {
					throw new Error(
						`Multi-boundary stream must flush the pending shell and all three templates; saw shell@${String(shellAt)} gauge@${String(gaugeAt)} chart@${String(chartAt)} reef@${String(reefAt)}.`,
					);
				}
				if (!(shellAt < gaugeAt && gaugeAt < chartAt && chartAt <= reefAt)) {
					throw new Error(
						`Templates must stream after the pending shell in settle/dependency order; saw shell@${String(shellAt)} gauge@${String(gaugeAt)} chart@${String(chartAt)} reef@${String(reefAt)}.`,
					);
				}
				// The dependent boundary's commit invocation carries the
				// compiler-known read-set edge onto its streamed dependency.
				await expect.html.contains(wire.text, '__mArm("reveal:2",["reveal:1"])');
				receipt.note(
					`multi-boundary chunk timing: pending shell @${String(shellAt)}ms, templates gauge@${String(gaugeAt)}ms chart@${String(chartAt)}ms reef@${String(reefAt)}ms in dependency order on one response`,
				);

				const revealPage = await preview.browser.visit(`${reveal.url}/reveal`);
				await expect.page.text(revealPage, '[data-content="reef"]', 'Reef window 14:10', WAIT);
				const revealDom = await revealPage.content();
				if (revealDom.includes('data-waiting') || /<template[^>]*m:arm/.test(revealDom)) {
					throw new Error('All streamed arms must be committed and their templates consumed.');
				}
				const commits = parseCommitMarks(revealDom);
				const fcp = parseFcpMark(revealDom);
				if (commits.map((commit) => commit.key).join(' ') !== 'gauge chart reef') {
					throw new Error(
						`Reveals must land in dependency order gauge -> chart -> reef; saw: ${commits.map((commit) => `${commit.key}@${String(commit.at)}`).join(' ')}`,
					);
				}
				const [gauge, chart, reef] = commits as [CommitMark, CommitMark, CommitMark];
				// G2 doctrine: the pending arms painted with the shell; the first
				// reveal waits out the minimum pending visibility after FCP.
				if (gauge.at - fcp < 190) {
					throw new Error(
						`First reveal must honor the minimum pending visibility (~200ms after FCP); gauge committed ${String(gauge.at - fcp)}ms after FCP @${String(fcp)}ms.`,
					);
				}
				// G1 cadence: the later arrivals join the NEXT train.
				if (chart.at - gauge.at < 250) {
					throw new Error(
						`Second train must leave no earlier than one cadence after the first reveal; saw gauge@${String(gauge.at)}ms chart@${String(chart.at)}ms.`,
					);
				}
				// C3: chart and reef ride the SAME train (one calm reveal), in
				// dependency order.
				if (reef.at - chart.at > 150) {
					throw new Error(
						`chart and reef must reveal in one train; saw chart@${String(chart.at)}ms reef@${String(reef.at)}ms.`,
					);
				}
				receipt.note(
					`reveal trains observed: FCP@${String(fcp)}ms, gauge@${String(gauge.at)}ms (>=FCP+190), chart@${String(chart.at)}ms (next train), reef@${String(reef.at)}ms (same train, dependency-ordered)`,
				);
			} finally {
				reveal.close();
			}
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

// ---- T113 reveal-train page (in-box; the router fixture stays single-boundary) ----

type CommitMark = { readonly key: string; readonly at: number };

// Box-owned instrumentation, served in the page head BEFORE any boundary
// content parses: records each committed boundary's content arrival (key +
// performance.now) and the document's real first-contentful-paint into DOM
// attributes the box reads back from page.content(). Test-side only — no
// production bytes.
const REVEAL_INSTRUMENTATION = `<script>(() => {
	const marks = [];
	new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) {
			if (!node.getAttribute) continue;
			const inner = node.querySelector && node.querySelector('[data-content]');
			const key = node.getAttribute('data-content') || (inner && inner.getAttribute('data-content'));
			if (key && marks.every((mark) => mark.indexOf(key + '@') !== 0)) {
				marks.push(key + '@' + Math.round(performance.now()));
				document.documentElement.setAttribute('data-commits', marks.join(' '));
			}
		}
	}).observe(document.documentElement, { childList: true, subtree: true });
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			if (entry.name === 'first-contentful-paint') {
				document.documentElement.setAttribute('data-fcp', String(Math.round(entry.startTime)));
			}
		}
	}).observe({ type: 'paint', buffered: true });
})();</script>`;

function parseCommitMarks(dom: string): CommitMark[] {
	const attribute = /data-commits="([^"]*)"/.exec(dom)?.[1] ?? '';
	return attribute
		.split(' ')
		.filter(Boolean)
		.map((mark) => {
			const [key, at] = mark.split('@');
			return { key: key ?? '', at: Number(at) };
		});
}

function parseFcpMark(dom: string): number {
	const attribute = /data-fcp="([^"]*)"/.exec(dom)?.[1];
	if (attribute === undefined) {
		throw new Error('Instrumented reveal page did not record a first-contentful-paint mark.');
	}
	return Number(attribute);
}

// Compiled-module-shaped three-boundary artifact (alternate-shaped: tide
// station panels). reef's computed carries a compiler-known read-set edge
// onto chart's in the state payload.
function revealTrainArtifact() {
	// Latencies picked so the browser observes both train behaviors: gauge
	// reveals alone (first train, G2 floor after FCP); chart misses that
	// train and opens the next one a full cadence later; reef arrives while
	// that train is still waiting, so chart+reef reveal TOGETHER in
	// dependency order.
	const panels = [
		{ key: 'gauge', delayMs: 450, label: 'Gauge steady 2.1m' },
		{ key: 'chart', delayMs: 600, label: 'Chart updated 13:40' },
		{ key: 'reef', delayMs: 630, label: 'Reef window 14:10', dependsOn: ['chart'] },
	];
	return {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const arms: string[] = [];
			for (const [index, panel] of panels.entries()) {
				const snapshot = (await marklessSsrRunAsyncComputed(
					snapshots as never,
					`computed:${panel.key}`,
					async () => {
						await new Promise((resolve) => setTimeout(resolve, panel.delayMs));
						return { label: panel.label };
					},
					renderContext,
					true,
				)) as { readonly status: string; readonly value?: { readonly label: string } };
				const arm =
					snapshot.status === 'fulfilled'
						? `<em data-content="${panel.key}">${snapshot.value!.label}</em>`
						: `<span data-waiting="${panel.key}">reading instruments</span>`;
				arms.push(
					`<!--markless:async:reveal:${String(index)}-->${arm}<!--/markless:async:reveal:${String(index)}-->`,
				);
			}
			return {
				html: `<section>${arms.join('')}</section>`,
				state: marklessSsrAttachSnapshots(
					{
						version: 1,
						cells: [],
						computed: panels.map((panel) => ({
							graphNodeId: `computed:${panel.key}`,
							name: panel.key,
							async: true,
							...(panel.dependsOn
								? {
										dependencies: panel.dependsOn.map((dependency) => ({
											graphNodeId: `computed:${dependency}`,
											path: [],
										})),
									}
								: {}),
						})),
					} as never,
					snapshots as never,
				),
				view: {
					version: 1,
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' }],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: panels.map((panel, index) => ({
						id: `reveal:${String(index)}`,
						startAnchor: { strategy: 'dom-order-comment', index: index * 2 },
						endAnchor: { strategy: 'dom-order-comment', index: index * 2 + 1 },
						asyncReads: [
							{ source: panel.key, graphNodeId: `computed:${panel.key}`, path: [] },
						],
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})),
				},
			} as never;
		},
	};
}

// Serves the reveal-train page through the production renderToStream with a
// genuinely chunked response — a fresh render (and per-request runner
// registry) per request.
async function serveRevealTrainPage(): Promise<{ url: string; close: () => void }> {
	const server = createServer((request, response) => {
		void (async () => {
			if (!request.url?.startsWith('/reveal')) {
				response.writeHead(404).end();
				return;
			}
			const stream = await renderToStream(revealTrainArtifact() as never, {});
			response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' });
			response.write(
				`<!doctype html><html><head><meta charset="utf-8"><title>reveal train</title>${REVEAL_INSTRUMENTATION}</head><body>${stream.shell}`,
			);
			for await (const chunk of stream.appends()) response.write(chunk);
			response.end('</body></html>');
		})().catch((error: unknown) => {
			response.destroy(error instanceof Error ? error : new Error(String(error)));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Reveal-train server did not report a port.');
	}
	return {
		url: `http://127.0.0.1:${String(address.port)}`,
		close: () => server.close(),
	};
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
