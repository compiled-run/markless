import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessSsrAttachSnapshots, marklessSsrRunAsyncComputed } from '../src/fns/ssr.ts';
import { createInlineResumerSelfWakeSource } from '../src/inline/resumer.ts';
import { renderToStream } from '../src/render-to-stream.ts';

// Once the page has painted, the reveal train holds a streamed commit on a timer.
// An event-less wake that starts the runtime before that commit lands finds the
// template still queued, skips its snapshot, and re-runs the fetch client-side.

function lighthouseArtifact(delayMs: number) {
	return {
		resumeModuleUrl: '/build/lighthouse-resume.js',
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const snapshot = (await marklessSsrRunAsyncComputed(
				snapshots as never,
				'computed:beam',
				async () => {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					return { bearing: 'north-north-east' };
				},
				renderContext,
				true,
			)) as { readonly status: string; readonly value?: { readonly bearing: string } };
			const arm =
				snapshot.status === 'fulfilled'
					? `<b data-bearing>${snapshot.value!.bearing}</b>`
					: '<i data-sweeping>Sweeping</i>';
			return {
				html: `<aside><!--markless:async:lamp:0-->${arm}<!--/markless:async:lamp:0--></aside>`,
				structure: { anchors: [{ kind: 'async', id: 'lamp:0', html: arm }] },
				state: marklessSsrAttachSnapshots(
					{
						version: ASYNC_PROTOCOL_VERSION,
						cells: [],
						computed: [{ graphNodeId: 'computed:beam', name: 'beam', async: true }],
					} as never,
					snapshots as never,
				),
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'aside' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'lamp:0',
							runnerGraphNodeId: 'computed:beam',
							initiallyServedArm:
								snapshot.status === 'fulfilled'
									? ASYNC_BOUNDARY_ARM.try
									: ASYNC_BOUNDARY_ARM.pending,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [
								{ source: 'beam', graphNodeId: 'computed:beam', path: [] },
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

async function streamedExecutorAndCommit(): Promise<{ executor: string; commit: string }> {
	const stream = await renderToStream(lighthouseArtifact(30) as never, {});
	expect(stream.pendingArmCount).toBe(1);
	let appended = '';
	for await (const chunk of stream.appends()) appended += chunk;
	const executor = /<script data-markless-stream-executor>([\s\S]*?)<\/script>/.exec(
		appended,
	)?.[1];
	const commit = /<script>(__mArm\([^<]*\))<\/script>/.exec(appended)?.[1];
	if (!executor || !commit)
		throw new Error('Expected the streamed executor and its commit call.');
	return { executor, commit };
}

function paintedDocument() {
	const log: string[] = [];
	const frames: Array<() => void> = [];
	const timers: Array<() => void> = [];
	const microtasks: Array<() => void> = [];
	const root = { addEventListener() {} } as Record<string, unknown>;
	const aside = { closest: () => root };
	const anchorParent = {
		insertBefore: () => log.push('settled arm inserted'),
	};
	const end = { data: '/markless:async:lamp:0', parentNode: anchorParent };
	const start = {
		data: 'markless:async:lamp:0',
		parentNode: anchorParent,
		parentElement: aside,
		nextSibling: null as unknown,
	};
	start.nextSibling = end;
	let templatePresent = true;
	const template = { content: {}, remove: () => (templatePresent = false) };
	const document = {
		readyState: 'complete',
		body: {},
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: () => null,
		},
		addEventListener() {},
		querySelector: (selector: string) =>
			selector.startsWith('template') && templatePresent ? template : null,
		createTreeWalker: () => {
			const nodes = [start, end];
			return { nextNode: () => nodes.shift() ?? null };
		},
	};
	const paintedAt = 1_000;
	let now = paintedAt + 40;
	const scope = {
		document,
		performance: {
			now: () => now,
			getEntriesByName: (name: string) =>
				name === 'first-contentful-paint' ? [{ startTime: paintedAt }] : [],
		},
		requestAnimationFrame: (callback: () => void) => frames.push(callback),
		setTimeout: (callback: () => void) => timers.push(callback),
		queueMicrotask: (callback: () => void) => microtasks.push(callback),
		__vite_ssr_dynamic_import__: async (url: string) => {
			log.push(`import ${url}`);
			return {
				resumeContainerEvent: (input: { readonly event: unknown }) => {
					log.push(`wake event=${String(input.event)}`);
					root.__asyncResumeRuntimeStarted = true;
				},
			};
		},
	};
	const run = (source: string) => {
		const keys = Object.keys(scope);
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		new Function(...keys, source)(...keys.map((key) => scope[key as keyof typeof scope]));
	};
	const drain = async () => {
		for (let turn = 0; turn < 20; turn++) {
			const next = frames.shift() ?? microtasks.shift();
			if (next) next();
			await Promise.resolve();
		}
	};
	const advance = (ms: number) => {
		now += ms;
		for (const timer of timers.splice(0)) timer();
	};
	return { log, run, drain, advance, timers };
}

test('an event-less wake waits for a timer-held streamed commit before starting the runtime', async () => {
	const { executor, commit } = await streamedExecutorAndCommit();
	const page = paintedDocument();
	try {
		page.run(executor);
		page.run(commit);
		expect(page.timers).toHaveLength(1);

		page.run(createInlineResumerSelfWakeSource('/build/lighthouse-resume.js'));
		await page.drain();
		expect(page.log).toEqual([]);

		page.advance(200);
		await page.drain();
		expect(page.log).toEqual([
			'settled arm inserted',
			'import /build/lighthouse-resume.js',
			'wake event=0',
		]);
	} finally {
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});

test('an event-less wake on a document with no queued streamed commit starts after one frame', async () => {
	const { executor } = await streamedExecutorAndCommit();
	const page = paintedDocument();
	try {
		page.run(executor);
		page.run(createInlineResumerSelfWakeSource('/build/lighthouse-resume.js'));
		await page.drain();
		expect(page.log).toEqual(['import /build/lighthouse-resume.js', 'wake event=0']);
	} finally {
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});
