import { expect, test } from 'vitest';
import { renderToStream } from '@markless/web/render-to-stream';
import { marklessSsrAttachSnapshots, marklessSsrRunAsyncComputed } from '@markless/web/fns/ssr';

// T107 streaming, show half of the show-then-adopt split: the __mArm inline
// executor commits a later-flushed inert <template m:arm> into the
// boundary's existing anchor range by REAL range replacement — no runtime
// loaded, no reveal dance, no placeholder indirection. A page that never
// wakes still shows settled content.

function beaconArtifact(delayMs: number) {
	return {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const snapshot = (await marklessSsrRunAsyncComputed(
				snapshots as never,
				'computed:signal',
				async () => {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					return { label: 'Signal locked' };
				},
				renderContext,
				true,
			)) as { readonly status: string; readonly value?: { readonly label: string } };
			const arm =
				snapshot.status === 'fulfilled'
					? `<strong data-signal>${snapshot.value!.label}</strong>`
					: '<span data-waiting>Listening…</span>';
			return {
				html: `<section><!--markless:async:beacon:0-->${arm}<!--/markless:async:beacon:0--></section>`,
				state: marklessSsrAttachSnapshots(
					{
						version: 1,
						cells: [],
						computed: [{ graphNodeId: 'computed:signal', name: 'signal', async: true }],
					} as never,
					snapshots as never,
				),
				view: {
					version: 1,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'beacon:0',
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [
								{ source: 'signal', graphNodeId: 'computed:signal', path: [] },
							],
							armRecords: {
								locators: [],
								events: [],
								behaviors: [],
								elementHandles: [],
							},
						},
					],
				},
			} as never;
		},
	};
}

function runInlineScripts(host: HTMLElement): void {
	for (const script of host.querySelectorAll('script:not([type]):not([data-ran])')) {
		// Streamed executor scripts run on parse in a real stream — exactly
		// once each; the test injects them via innerHTML (inert), so it
		// executes them explicitly and marks them so a later chunk's pass
		// never re-executes an earlier chunk's commit invocation.
		script.setAttribute('data-ran', '');
		new Function(script.textContent ?? '')();
	}
}

// Two-boundary artifact for the reveal-train tests (alternate-shaped: tide
// tables). Sensors declare latency and compiler-known read-set edges
// (state payload `dependencies`) onto other sensors.
function tideArtifact(
	sensors: ReadonlyArray<{
		readonly key: string;
		readonly delayMs: number;
		readonly label: string;
		readonly dependsOn?: ReadonlyArray<string>;
	}>,
) {
	return {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
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
					true,
				)) as { readonly status: string; readonly value?: { readonly label: string } };
				const arm =
					snapshot.status === 'fulfilled'
						? `<em data-tide="${sensor.key}">${snapshot.value!.label}</em>`
						: `<span data-tide-waiting="${sensor.key}">reading gauges</span>`;
				arms.push(
					`<!--markless:async:tide:${index}-->${arm}<!--/markless:async:tide:${index}-->`,
				);
			}
			return {
				html: `<section>${arms.join('')}</section>`,
				state: marklessSsrAttachSnapshots(
					{
						version: 1,
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
					version: 1,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: sensors.map((sensor, index) => ({
						id: `tide:${index}`,
						startAnchor: { strategy: 'dom-order-comment', index: index * 2 },
						endAnchor: { strategy: 'dom-order-comment', index: index * 2 + 1 },
						asyncReads: [
							{ source: sensor.key, graphNodeId: `computed:${sensor.key}`, path: [] },
						],
						armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
					})),
				},
			} as never;
		},
	};
}

// Records each streamed commit (which boundary content entered the live DOM,
// and when) in mutation order — reveal-train order and cadence are the
// observable truth here, not implementation internals.
function observeTideCommits(host: HTMLElement): {
	readonly commits: ReadonlyArray<{ readonly key: string; readonly at: number }>;
	readonly disconnect: () => void;
} {
	const commits: Array<{ readonly key: string; readonly at: number }> = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of record.addedNodes) {
				const element = node as HTMLElement;
				const marker =
					element.getAttribute?.('data-tide') ??
					element.querySelector?.('[data-tide]')?.getAttribute('data-tide');
				if (marker && !commits.some((commit) => commit.key === marker)) {
					commits.push({ key: marker, at: performance.now() });
				}
			}
		}
	});
	observer.observe(host, { childList: true, subtree: true });
	return { commits, disconnect: () => observer.disconnect() };
}

// Paint-timing entries exist only in top-level documents, never in the test
// iframe — the executor would (correctly) treat this document as unpainted
// and flush pre-paint. Simulating a first-contentful-paint entry at a chosen
// age exercises the painted-document train semantics; the streaming witness
// box re-proves them against a real top-level FCP.
function simulateFirstContentfulPaint(ageMs: number): {
	readonly paintedAt: number;
	readonly restore: () => void;
} {
	const original = performance.getEntriesByName.bind(performance);
	const paintedAt = performance.now() - ageMs;
	(performance as { getEntriesByName: typeof performance.getEntriesByName }).getEntriesByName = ((
		name: string,
		type?: string,
	) =>
		name === 'first-contentful-paint'
			? [{ startTime: paintedAt } as PerformanceEntry]
			: original(name, type)) as typeof performance.getEntriesByName;
	return {
		paintedAt,
		restore: () => {
			(
				performance as { getEntriesByName: typeof performance.getEntriesByName }
			).getEntriesByName = original;
		},
	};
}

// G1/C3 reveal trains: commits arriving in the same settle wave reveal in
// dependency order (compiler-known read-set edges), not script/document
// order.
test('same-wave streamed commits reveal in dependency order, not document order', async () => {
	// Document order puts the DEPENDENT boundary first; both settle in the
	// same wave, so its commit script parses first. The reveal must still
	// commit the dependency before the dependent.
	const stream = await renderToStream(
		tideArtifact([
			{ key: 'detail', delayMs: 25, label: 'Slack water 14:10', dependsOn: ['summary'] },
			{ key: 'summary', delayMs: 25, label: 'Ebb tide until 13:40' },
		]) as never,
		{},
	);
	expect(stream.pendingArmCount).toBe(2);

	const host = document.createElement('div');
	document.body.appendChild(host);
	const tail = document.createElement('div');
	document.body.appendChild(tail);
	const observed = observeTideCommits(host);
	try {
		host.innerHTML = stream.shell;
		for await (const chunk of stream.appends()) {
			tail.insertAdjacentHTML('beforeend', chunk);
			runInlineScripts(tail);
		}
		await expect
			.poll(() => host.querySelectorAll('[data-tide]').length, { timeout: 5_000 })
			.toBe(2);
		expect(observed.commits.map((commit) => commit.key)).toEqual(['summary', 'detail']);
	} finally {
		observed.disconnect();
		tail.remove();
		host.remove();
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});

// G1 train cadence: after a reveal, the next independent reveal waits out the
// train window instead of dribbling commits one frame apart (React
// FALLBACK_THROTTLE prior art, ~300ms).
test('an independent commit arriving just after a reveal joins the next train, one cadence later', async () => {
	const stream = await renderToStream(
		tideArtifact([
			{ key: 'height', delayMs: 20, label: 'High water 2.1m' },
			{ key: 'wind', delayMs: 70, label: 'Wind SW 4' },
		]) as never,
		{},
	);
	expect(stream.pendingArmCount).toBe(2);

	const paint = simulateFirstContentfulPaint(1_000);
	const host = document.createElement('div');
	document.body.appendChild(host);
	const tail = document.createElement('div');
	document.body.appendChild(tail);
	const observed = observeTideCommits(host);
	try {
		host.innerHTML = stream.shell;
		for await (const chunk of stream.appends()) {
			tail.insertAdjacentHTML('beforeend', chunk);
			runInlineScripts(tail);
		}
		await expect
			.poll(() => host.querySelector('[data-tide="wind"]')?.textContent, { timeout: 5_000 })
			.toBe('Wind SW 4');
		expect(observed.commits.map((commit) => commit.key)).toEqual(['height', 'wind']);
		const gap = observed.commits[1]!.at - observed.commits[0]!.at;
		// Timers only fire late: the second reveal comes no earlier than the
		// cadence window minus a scheduling margin.
		expect(gap).toBeGreaterThanOrEqual(250);
	} finally {
		paint.restore();
		observed.disconnect();
		tail.remove();
		host.remove();
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});

// G2 as doctrine (T119 ruling): streamed pending UI follows deadline-gated
// @pending semantics — a pending arm that painted holds at least the shared
// minimum visible duration before the settled range replaces it.
test('a streamed commit arriving just after first paint waits out the pending minimum visibility', async () => {
	const stream = await renderToStream(
		tideArtifact([{ key: 'salinity', delayMs: 20, label: 'Salinity 34 PSU' }]) as never,
		{},
	);
	expect(stream.pendingArmCount).toBe(1);

	// The document painted 40ms ago: the pending arm just became visible.
	const paint = simulateFirstContentfulPaint(40);
	const host = document.createElement('div');
	document.body.appendChild(host);
	const tail = document.createElement('div');
	document.body.appendChild(tail);
	const observed = observeTideCommits(host);
	try {
		host.innerHTML = stream.shell;
		for await (const chunk of stream.appends()) {
			tail.insertAdjacentHTML('beforeend', chunk);
			runInlineScripts(tail);
		}
		await expect
			.poll(() => host.querySelector('[data-tide="salinity"]')?.textContent, {
				timeout: 5_000,
			})
			.toBe('Salinity 34 PSU');
		// The template arrived ~60ms after the simulated paint, but the reveal
		// held until the pending arm had been visible the minimum duration
		// (timers only fire late; small margin for timestamp rounding).
		expect(observed.commits).toHaveLength(1);
		expect(observed.commits[0]!.at - paint.paintedAt).toBeGreaterThanOrEqual(190);
	} finally {
		paint.restore();
		observed.disconnect();
		tail.remove();
		host.remove();
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});

test('__mArm commits a later-flushed template into the anchor range without the runtime', async () => {
	const stream = await renderToStream(beaconArtifact(30) as never, {});
	expect(stream.pendingArmCount).toBe(1);

	const host = document.createElement('div');
	document.body.appendChild(host);
	try {
		host.innerHTML = stream.shell;
		expect(host.querySelector('[data-waiting]')?.textContent).toBe('Listening…');
		expect(host.querySelector('[data-signal]')).toBeNull();

		const tail = document.createElement('div');
		document.body.appendChild(tail);
		try {
			for await (const chunk of stream.appends()) {
				tail.insertAdjacentHTML('beforeend', chunk);
				runInlineScripts(tail);
			}

			// Settled content committed between the boundary's own anchors (the
			// reveal train schedules the commit; ordering-only assertions here).
			await expect
				.poll(() => host.querySelector('[data-signal]')?.textContent, { timeout: 5_000 })
				.toBe('Signal locked');
			expect(host.querySelector('[data-waiting]')).toBeNull();
			const section = host.querySelector('section')!;
			const comments = [...section.childNodes].filter((node) => node.nodeType === 8);
			expect(comments.map((node) => node.textContent)).toEqual([
				'markless:async:beacon:0',
				'/markless:async:beacon:0',
			]);
			// The inert template was consumed; records + patch scripts stay in
			// the document for the resume runtime to adopt at wake.
			expect(document.querySelector('template[m\\:arm]')).toBeNull();
			expect(
				document.querySelector('script[type="markless/arm"][data-boundary="beacon:0"]'),
			).not.toBeNull();
			expect(
				document.querySelector(
					'script[type="markless/state-patch"][data-graph-node="computed:signal"]',
				),
			).not.toBeNull();
		} finally {
			tail.remove();
		}
	} finally {
		host.remove();
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});
