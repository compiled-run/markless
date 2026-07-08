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

// Multi-boundary compiled-module-shaped artifact (alternate-shaped: orchard
// sensor rows, not a dashboard). Sensors declare their own latency, whether
// they authored a @pending arm (the streaming opt-in), and compiler-known
// read-set edges (state payload `dependencies`) onto other sensors.
type OrchardSensor = {
	readonly key: string;
	readonly delayMs: number;
	readonly label: string;
	readonly hasPendingArm?: boolean;
	readonly dependsOn?: ReadonlyArray<string>;
};

function orchardArtifact(
	sensors: ReadonlyArray<OrchardSensor>,
	options: { readonly settleWaveLagMs?: number } = {},
) {
	let renderPass = 0;
	return {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			renderPass += 1;
			const snapshots: unknown[] = [];
			const arms: string[] = [];
			for (const [index, sensor] of sensors.entries()) {
				const snapshot = (await marklessSsrRunAsyncComputed(
					snapshots as never,
					`computed:${sensor.key}`,
					async () => {
						await new Promise((resolve) => setTimeout(resolve, sensor.delayMs));
						return { label: sensor.label };
					},
					renderContext,
					sensor.hasPendingArm !== false,
				)) as { readonly status: string; readonly value?: { readonly label: string } };
				const arm =
					snapshot.status === 'fulfilled'
						? `<p data-sensor="${sensor.key}">${snapshot.value!.label}</p>`
						: snapshot.status === 'rejected'
							? `<p data-fault="${sensor.key}">sensor offline</p>`
							: `<p data-calibrating="${sensor.key}">calibrating</p>`;
				arms.push(
					`<!--markless:async:orchard:${index}-->${arm}<!--/markless:async:orchard:${index}-->`,
				);
			}
			// Simulates a slow settle-wave re-render pass (composition work after
			// the runs), so settles can race the pass — the request-versioning
			// window. Only settle waves lag (pass 3+): the discovery and shell
			// passes stay fast so the wave timing is deterministic.
			if (options.settleWaveLagMs && renderPass >= 3) {
				await new Promise((resolve) => setTimeout(resolve, options.settleWaveLagMs));
			}
			return {
				html: `<main>${arms.join('')}</main>`,
				state: marklessSsrAttachSnapshots(
					{
						version: ASYNC_PROTOCOL_VERSION,
						cells: [],
						computed: sensors.map((sensor) => ({
							graphNodeId: `computed:${sensor.key}`,
							name: sensor.key,
							async: true,
							...(sensor.dependsOn
								? {
										dependencies: sensor.dependsOn.map((dependency) => ({
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
					version: ASYNC_PROTOCOL_VERSION,
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: sensors.map((sensor, index) => ({
						id: `orchard:${index}`,
						startAnchor: { strategy: 'dom-order-comment', index: index * 2 },
						endAnchor: { strategy: 'dom-order-comment', index: index * 2 + 1 },
						asyncReads: [
							{
								source: sensor.key,
								graphNodeId: `computed:${sensor.key}`,
								path: [],
								runnerSymbolId: `symbol:${sensor.key}-run`,
							},
						],
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})),
				},
			} as never;
		},
	};
}

// C1 parallel runner starts (T113): every boundary runner starts at request
// start, so a slow early boundary cannot consume the shared first-flush
// deadline on behalf of a fast later one.
test('a slow early boundary does not make a later deadline-beating boundary stream', async () => {
	const stream = await renderToStream(
		orchardArtifact([
			{ key: 'frost', delayMs: 60, label: 'Frost risk low' },
			{ key: 'soil', delayMs: 5, label: 'Soil moisture 42%' },
		]) as never,
		{},
	);

	// The fast sensor beat the deadline because its runner started at request
	// start — it renders inline with zero streaming artifacts.
	expect(stream.pendingArmCount).toBe(1);
	expect(stream.shell).toContain('Soil moisture 42%');
	expect(stream.shell).not.toContain('data-calibrating="soil"');
	expect(stream.shell).toContain('data-calibrating="frost"');

	const chunks = await collect(stream.appends());
	const appended = chunks.join('');
	expect(appended).toContain('<template m:arm="orchard:0">');
	expect(appended).not.toContain('<template m:arm="orchard:1">');
});

// S1 request-versioning audit (T113): a settle that lands WHILE a re-render
// pass is in flight must not stream that pass's output for its boundary —
// the pass rendered the boundary's @pending arm and a pending snapshot. The
// settled truth for a wave is the wave's own render output (Ripple's
// versioned-request pattern: completions are checked against the version
// they rendered under), so the late settle streams in the next wave.
test('a settle racing the re-render pass streams its own settled wave, never the pending output', async () => {
	const stream = await renderToStream(
		orchardArtifact(
			[
				{ key: 'canopy', delayMs: 30, label: 'Canopy shade 60%' },
				{ key: 'irrigation', delayMs: 50, label: 'Irrigation line clear' },
			],
			{ settleWaveLagMs: 40 },
		) as never,
		{},
	);
	expect(stream.pendingArmCount).toBe(2);

	const chunks = await collect(stream.appends());
	const appended = chunks.join('');
	// Every streamed template carries settled content — never a pending arm
	// captured by a render pass the settle raced.
	expect(appended).toContain('Canopy shade 60%');
	expect(appended).toContain('Irrigation line clear');
	const templates = appended.match(/<template m:arm="[^"]*">.*?<\/template>/g) ?? [];
	expect(templates).toHaveLength(2);
	for (const template of templates) expect(template).not.toContain('data-calibrating');
	const patches = appended.match(/<script type="markless\/state-patch"[^>]*>.*?<\/script>/g) ?? [];
	expect(patches).toHaveLength(2);
	for (const patch of patches) expect(patch).toContain('"status":"fulfilled"');
});

test('hold-the-stream boundaries resolve their runners in parallel, not sequentially', async () => {
	const startedAt = Date.now();
	const stream = await renderToStream(
		orchardArtifact([
			{ key: 'north', delayMs: 80, label: 'North rows green', hasPendingArm: false },
			{ key: 'south', delayMs: 80, label: 'South rows green', hasPendingArm: false },
		]) as never,
		{},
	);
	const elapsed = Date.now() - startedAt;

	expect(stream.pendingArmCount).toBe(0);
	expect(stream.shell).toContain('North rows green');
	expect(stream.shell).toContain('South rows green');
	// Sequential starts would need >= 160ms; parallel starts finish in ~80ms.
	expect(elapsed).toBeLessThan(150);
});

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

// G1/C3 reveal choreography (T113): the compiler-known read-set edges in the
// state payload become boundary-to-boundary reveal dependencies. Streamed
// commit invocations carry the streamed boundaries the committing boundary
// depends on, so the client executor reveals dependency-ordered trains
// instead of blind arrival order.
test('streamed commit invocations carry compiler-known dependency edges onto streamed boundaries', async () => {
	const stream = await renderToStream(
		orchardArtifact([
			{ key: 'weather', delayMs: 25, label: 'Weather feed live' },
			{ key: 'advice', delayMs: 25, label: 'Prune after the frost', dependsOn: ['weather'] },
		]) as never,
		{},
	);
	expect(stream.pendingArmCount).toBe(2);

	const appended = (await collect(stream.appends())).join('');
	// The dependency-free boundary commits with no reveal dependencies; the
	// dependent one names the streamed boundary its read set points at.
	expect(appended).toContain('__mArm("orchard:0")');
	expect(appended).toContain('__mArm("orchard:1",["orchard:0"])');
});

test('dependency edges onto inline-settled boundaries are not reveal dependencies', async () => {
	const stream = await renderToStream(
		orchardArtifact([
			{ key: 'weather', delayMs: 0, label: 'Weather feed live' },
			{ key: 'advice', delayMs: 30, label: 'Prune after the frost', dependsOn: ['weather'] },
		]) as never,
		{},
	);
	// The dependency settled inline with the shell — it is already visible,
	// so the streamed boundary must not wait for a commit that never comes.
	expect(stream.pendingArmCount).toBe(1);
	expect(stream.shell).toContain('Weather feed live');

	const appended = (await collect(stream.appends())).join('');
	expect(appended).toContain('__mArm("orchard:1")');
	expect(appended).not.toContain('__mArm("orchard:1",');
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
