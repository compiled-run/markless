import { box } from '@async/witness';
import {
	assertArmRecordCell,
	reachableArmRecordCells,
} from '../../live-feed/boxes/arm-record-cells';

const WAIT = { timeoutMs: 10_000 };
const FULL_PAYLOAD_SCRIPT_BYTES = 4_761;
const DELTA_PAYLOAD_SCRIPT_BYTES_MAX = 3_200;

export default box(
	{
		name: 'live-feed ssr: settled, streamed, rejected, and resumed witnesses stay distinct',
		tags: ['live-feed', 'ssr', 'preview', 'browser', 'async', 'repeat', 'streaming'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts', mode: 'ssr' }),
		});
		const preview = await pipeline.preview(build);

		// Settled SSR is its own scenario: fast request-time data is already in
		// the response, and loading that response executes no app/component JS.
		const settledHtml = await preview.request('/?latency=0');
		await expect.html.contains(settledHtml, 'data-feed-settled');
		await expect.html.contains(settledHtml, 'data-row-key="atlas-204"');
		await expect.html.contains(settledHtml, '<script type="markless/state">');
		await expect.html.contains(settledHtml, '<script type="markless/view">');
		const deltaPayload = readResumePayload(settledHtml);
		if (
			deltaPayload.state.cells.length !== 0 ||
			deltaPayload.state.computed.length === 0 ||
			deltaPayload.view.locators.length !== 0 ||
			deltaPayload.view.events.length !== 0 ||
			deltaPayload.view.domUpdates.length === 0 ||
			deltaPayload.view.asyncBoundaries.length === 0
		) {
			throw new Error(
				'Expected live-feed SSR payload scripts to carry only request-divergent keyed records.',
			);
		}
		if (deltaPayload.bytes > DELTA_PAYLOAD_SCRIPT_BYTES_MAX) {
			throw new Error(
				`Expected live-feed SSR delta payload <= ${DELTA_PAYLOAD_SCRIPT_BYTES_MAX} bytes, got ${deltaPayload.bytes}.`,
			);
		}
		receipt.note(
			`live-feed SSR payload scripts: ${FULL_PAYLOAD_SCRIPT_BYTES} bytes full -> ${deltaPayload.bytes} bytes delta`,
		);
		if (settledHtml.includes('data-feed-pending')) {
			throw new Error('Expected the fast SSR response to settle before the shell flush.');
		}
		const settledCell = reachableArmRecordCells('ssr').find(
			(cell) => cell.posture === 'ssr-settled',
		)!;
		const settledPage = await preview.browser.visit(`/?latency=${settledCell.latencyMs}`);
		await waitForSettledLoadAccounting(settledPage, WAIT);
		await assertArmRecordCell(settledPage, expect, settledCell);
		receipt.note(`arm-record matrix passed: ${settledCell.id}`);

		// Raw response timing is deliberately separate from painted-DOM checks:
		// pending can flush in the stream without the browser ever painting it.
		const held = await inspectHeldStream(new URL('/?latency=900', preview.url));
		if (!held.firstChunk.includes('data-feed-pending')) {
			throw new Error('Expected held SSR raw stream to flush the pending arm first.');
		}
		if (!held.firstChunk.includes('data-markless-self-wake')) {
			throw new Error('Expected held SSR raw stream to carry the self-wake marker.');
		}
		const shellPayloadBytes = readPayloadScriptBytes(held.firstChunk);
		if (shellPayloadBytes !== 0) {
			throw new Error(
				`Expected held SSR raw stream shell to carry zero payload bytes, got ${shellPayloadBytes}.`,
			);
		}
		if (held.firstChunkElapsedMs >= held.totalElapsedMs) {
			throw new Error('Expected a distinct pending flush before held SSR completion.');
		}
		receipt.note(
			`held pending raw-stream scenario: payload=${FULL_PAYLOAD_SCRIPT_BYTES} bytes full -> ${shellPayloadBytes} bytes shell; first=${held.firstChunkElapsedMs}ms total=${held.totalElapsedMs}ms`,
		);

		const streamedCells = reachableArmRecordCells('ssr').filter(
			(cell) => cell.posture === 'ssr-streamed',
		);
		const heldPage = await preview.browser.visit(
			`/?latency=${streamedCells[0]!.latencyMs}`,
		);
		await assertArmRecordCell(heldPage, expect, streamedCells[0]!);
		receipt.note(`arm-record matrix passed: ${streamedCells[0]!.id}`);
		const heldStartupScripts = (await heldPage.networkRequests())
			.map((request) => new URL(request.url).pathname)
			.filter((path) => path.startsWith('/build/') && path.endsWith('.js'));
		if (heldStartupScripts.length === 0) {
			throw new Error(
				'Expected held SSR self-wake to request resume JavaScript before interaction.',
			);
		}
		receipt.note(`held pending self-wake startup JS: ${heldStartupScripts.join(', ')}`);

		receipt.note(
			'covered cells (see arm-record-cells.ts reasons): ssr-streamed:settle-after-interaction (witness visit awaits the load event, so no click can land inside a held stream) and ssr-streamed:queued-commit-at-wake — both pinned by ssr-streamed:settle-before-interaction + prerendered:settle-after-interaction',
		);

		const rejectedHtml = await preview.request('/?latency=0&fail=1');
		await expect.html.contains(rejectedHtml, 'data-feed-error');
		const rejectedPage = await preview.browser.visit('/?latency=0&fail=1');
		await expect.page.text(
			rejectedPage,
			'[data-feed-error]',
			'Local updates unavailable',
			WAIT,
		);

		await expect.page.outcome(settledPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(heldPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(rejectedPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture(
			'live-feed ssr settled lazily, streamed pending with self-wake, rejected, and resumed interactions',
		);
	},
);

type ContentPage = { content(): Promise<string> };

function readResumePayload(html: string): {
	readonly bytes: number;
	readonly state: {
		readonly cells: ReadonlyArray<unknown>;
		readonly computed: ReadonlyArray<unknown>;
	};
	readonly view: {
		readonly locators: ReadonlyArray<unknown>;
		readonly events: ReadonlyArray<unknown>;
		readonly domUpdates: ReadonlyArray<unknown>;
		readonly asyncBoundaries: ReadonlyArray<unknown>;
	};
} {
	const scripts = [...html.matchAll(/<script type="markless\/(state|view)">([\s\S]*?)<\/script>/g)];
	const payload = Object.fromEntries(
		scripts.map((match) => [match[1], JSON.parse(match[2]!) as unknown]),
	) as { readonly state?: unknown; readonly view?: unknown };
	if (!payload.state || !payload.view) throw new Error('Expected both resume delta payload scripts.');
	return {
		bytes: scripts.reduce((total, match) => total + new TextEncoder().encode(match[0]).length, 0),
		state: payload.state as never,
		view: payload.view as never,
	};
}

function readPayloadScriptBytes(html: string): number {
	return [...html.matchAll(/<script type="markless\/(?:state|view)">[\s\S]*?<\/script>/g)].reduce(
		(total, match) => total + new TextEncoder().encode(match[0]).length,
		0,
	);
}

async function waitForSettledLoadAccounting(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (
			/data-markless-log-summary="markless: resumed — 0\.0 KB app executed, \d+ modules preloaded \(0 app executed\) · 0\.0 KB instrument"/.test(
				html,
			) &&
			/data-markless-log-app-bytes="0"/.test(html) &&
			/data-markless-log-instrument-bytes="0"/.test(html)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected settled SSR load accounting to report zero app/component execution.');
}

async function inspectHeldStream(url: URL): Promise<{
	readonly firstChunk: string;
	readonly firstChunkElapsedMs: number;
	readonly totalElapsedMs: number;
}> {
	const started = Date.now();
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`Expected held SSR stream response, got HTTP ${response.status}.`);
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const first = await reader.read();
	const firstChunkElapsedMs = Date.now() - started;
	let firstChunk = first.value ? decoder.decode(first.value, { stream: !first.done }) : '';
	while (!first.done && !firstChunk.includes('data-feed-pending')) {
		const next = await reader.read();
		if (next.done) break;
		firstChunk += decoder.decode(next.value, { stream: true });
	}
	for (;;) {
		const next = await reader.read();
		if (next.done) break;
	}
	return { firstChunk, firstChunkElapsedMs, totalElapsedMs: Date.now() - started };
}
