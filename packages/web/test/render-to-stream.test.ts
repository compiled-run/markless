import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessSsrAttachSnapshots, marklessSsrRunAsyncComputed } from '../src/fns/ssr.ts';
import { renderToStream } from '../src/render-to-stream.ts';

// A compiled-module-shaped artifact: renderSsr threads the render context
// into marklessSsrRunAsyncComputed exactly like emitted code does, renders
// the taken arm between the boundary's comment anchors, and reports the
// armized record set for the arm it actually served (alternate-shaped: a
// beacon relay, not a dashboard).
function relayArtifact(input: { readonly delayMs: number; readonly fail?: boolean }) {
	return {
		resumeModuleUrl: '/build/relay-resume.js',
		async renderSsr(props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const snapshot = (await marklessSsrRunAsyncComputed(
				snapshots as never,
				'computed:report',
				async () => {
					await new Promise((resolve) => setTimeout(resolve, input.delayMs));
					if (input.fail) throw new TypeError('relay unreachable');
					return {
						headline: (props as { headline?: string } | undefined)?.headline ?? 'Relay report ready',
					};
				},
				renderContext,
				true,
			)) as { readonly status: string; readonly value?: { readonly headline: string } };
			const arm =
				snapshot.status === 'fulfilled'
					? `<article><h2>${snapshot.value!.headline}</h2><button>Ping relay</button></article>`
					: snapshot.status === 'rejected'
						? '<p>Relay offline</p>'
						: '<p>Scanning channels</p>';
			const armRecords =
				snapshot.status === 'fulfilled'
					? {
							locators: [
								{ hostNodeId: 'h2', strategy: 'arm-relative', index: 0, tagName: 'article' },
								{ hostNodeId: 'h3', strategy: 'arm-relative', index: 2, tagName: 'button' },
							],
							events: [{ hostNodeId: 'h3', eventName: 'click', symbolIds: ['symbol:relay-tap'] }],
							behaviors: [],
							elementHandles: [],
						}
					: { locators: [], events: [], behaviors: [], elementHandles: [] };
			return {
				html: `<main><!--markless:async:boundary:0-->${arm}<!--/markless:async:boundary:0--></main>`,
				state: marklessSsrAttachSnapshots(
					{
						version: ASYNC_PROTOCOL_VERSION,
						cells: [],
						computed: [{ graphNodeId: 'computed:report', name: 'report', async: true }],
					},
					snapshots as never,
				),
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'boundary:0',
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [
								{
									source: 'report',
									graphNodeId: 'computed:report',
									path: [],
									runnerSymbolId: 'symbol:relay-run',
								},
							],
							armRecords,
						},
					],
				},
			} as never;
		},
	};
}

async function collect(appends: AsyncGenerator<string>): Promise<string[]> {
	const chunks: string[] = [];
	for await (const chunk of appends) chunks.push(chunk);
	return chunks;
}

test('renderToStream flushes the pending shell and appends the settled arm out of order', async () => {
	const stream = await renderToStream(relayArtifact({ delayMs: 40 }) as never, {});

	// Shell: pending arm in place, pending snapshot in the payload, resumer on.
	expect(stream.pendingArmCount).toBe(1);
	expect(stream.shell).toContain('<p>Scanning channels</p>');
	expect(stream.shell).not.toContain('Relay report ready');
	expect(stream.shell).toContain('"status":"pending"');
	expect(stream.shell).toContain('data-async-resumer');

	const chunks = await collect(stream.appends());
	expect(chunks).toHaveLength(1);
	const chunk = chunks[0]!;
	// Inert template + records + incremental snapshot + executor invocation.
	expect(chunk).toContain('globalThis.__mArm');
	expect(chunk).toContain('<template m:arm="boundary:0">');
	expect(chunk).toContain('<h2>Relay report ready</h2>');
	expect(chunk).toContain('<script type="markless/arm" data-boundary="boundary:0">');
	expect(chunk).toContain('"eventName":"click"');
	expect(chunk).toContain('<script type="markless/state-patch" data-graph-node="computed:report">');
	expect(chunk).toContain('"status":"fulfilled"');
	// Snapshot values are envelope-encoded like every served payload field.
	expect(chunk).toContain('"records"');
	expect(chunk).toContain('__mArm("boundary:0")');
	// The executor learns the resume module for post-commit wake triggers.
	expect(chunk).toContain('/build/relay-resume.js');
});

test('renderToStream renders inline when the runner beats the first-flush deadline', async () => {
	const stream = await renderToStream(relayArtifact({ delayMs: 0 }) as never, {});

	expect(stream.pendingArmCount).toBe(0);
	expect(stream.shell).toContain('Relay report ready');
	expect(stream.shell).not.toContain('Scanning channels');
	// Zero streaming artifacts: the data beat the deadline.
	expect(stream.shell).not.toContain('m:arm');
	expect(stream.shell).not.toContain('state-patch');
	expect(stream.shell).not.toContain('__mArm');
	expect(await collect(stream.appends())).toHaveLength(0);
});

// T116 best-effort 4: the render-context threading exists exactly so that
// two overlapping streamed responses cannot bleed values, boundary chunks, or
// snapshot patches into each other — even when they share graph node ids.
test('two interleaved streaming renders with different props/latencies stay isolated', async () => {
	const [slowStream, fastStream] = await Promise.all([
		renderToStream(relayArtifact({ delayMs: 60 }) as never, {
			props: { headline: 'Alpha uplink ready' },
		}),
		renderToStream(relayArtifact({ delayMs: 15 }) as never, {
			props: { headline: 'Beta uplink ready' },
		}),
	]);
	// Both missed the first-flush deadline: pending shells, streaming route.
	expect(slowStream.pendingArmCount).toBe(1);
	expect(fastStream.pendingArmCount).toBe(1);
	expect(slowStream.shell).not.toContain('uplink ready');
	expect(fastStream.shell).not.toContain('uplink ready');

	const settleOrder: string[] = [];
	const [slowChunks, fastChunks] = await Promise.all([
		collect(slowStream.appends()).then((chunks) => {
			settleOrder.push('slow');
			return chunks;
		}),
		collect(fastStream.appends()).then((chunks) => {
			settleOrder.push('fast');
			return chunks;
		}),
	]);
	// The faster render finished first: the two streams genuinely overlapped.
	expect(settleOrder).toEqual(['fast', 'slow']);

	// Each response carries exactly its own settled arm and snapshot patch,
	// despite both renders using the same boundary and graph node ids.
	expect(slowChunks).toHaveLength(1);
	expect(fastChunks).toHaveLength(1);
	expect(slowChunks[0]).toContain('Alpha uplink ready');
	expect(slowChunks[0]).not.toContain('Beta');
	expect(fastChunks[0]).toContain('Beta uplink ready');
	expect(fastChunks[0]).not.toContain('Alpha');
	for (const chunk of [slowChunks[0]!, fastChunks[0]!]) {
		expect(chunk).toContain('<template m:arm="boundary:0">');
		expect(chunk).toContain('data-graph-node="computed:report"');
		expect(chunk).toContain('"status":"fulfilled"');
	}
});

test('renderToStream streams the settled @catch arm with the durable error shape', async () => {
	const stream = await renderToStream(relayArtifact({ delayMs: 40, fail: true }) as never, {});

	expect(stream.shell).toContain('Scanning channels');
	const chunks = await collect(stream.appends());
	expect(chunks).toHaveLength(1);
	expect(chunks[0]).toContain('<template m:arm="boundary:0"><p>Relay offline</p></template>');
	expect(chunks[0]).toContain('"status":"rejected"');
	expect(chunks[0]).toContain('relay unreachable');
	expect(chunks[0]).not.toContain('"stack"');
});
