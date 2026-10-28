import { expect, test } from 'vitest';
import { renderToStream } from '@markless/web/render-to-stream';
import { marklessSsrAttachSnapshots, marklessSsrRunAsyncComputed } from '@markless/web/fns/ssr';
import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '../../serializer/src/index.ts';

// A streamed @try arm whose markup sets members with no live attribute carries their values with it,
// so they hold as soon as the arm is committed, with no resume code loaded.
const SEEDED_ARM =
	'<label><input data-select-all type="checkbox" indeterminate="">Select all</label><div data-pane style="height: 30px; overflow: auto" scrollTop="40"><div style="height: 300px">mail</div></div><audio data-chime volume="0.25"></audio>';

function inboxArtifact(delayMs: number, settledArm = SEEDED_ARM) {
	return {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			const snapshots: unknown[] = [];
			const snapshot = (await marklessSsrRunAsyncComputed(
				snapshots as never,
				'computed:inbox',
				async () => {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					return { unread: 3 };
				},
				renderContext,
				true,
			)) as { readonly status: string };
			const arm =
				snapshot.status === 'fulfilled'
					? settledArm
					: '<span data-loading>Loading mail</span>';
			return {
				html: `<section><!--markless:async:inbox:0-->${arm}<!--/markless:async:inbox:0--></section>`,
				structure: { anchors: [{ kind: 'async', id: 'inbox:0', html: arm }] },
				state: marklessSsrAttachSnapshots(
					{
						version: ASYNC_PROTOCOL_VERSION,
						cells: [],
						computed: [{ graphNodeId: 'computed:inbox', name: 'inbox', async: true }],
					} as never,
					snapshots as never,
				),
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'inbox:0',
							runnerGraphNodeId: 'computed:inbox',
							initiallyServedArm:
								snapshot.status === 'fulfilled'
									? ASYNC_BOUNDARY_ARM.try
									: ASYNC_BOUNDARY_ARM.pending,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [
								{ source: 'inbox', graphNodeId: 'computed:inbox', path: [] },
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
		script.setAttribute('data-ran', '');
		new Function(script.textContent ?? '')();
	}
}

test('a streamed arm sets indeterminate, scrollTop and volume when it is committed, before any resume code loads', async () => {
	// The resume module is never fetched here: the page stays on its inline scripts, as on a slow connection.
	const stream = await renderToStream(inboxArtifact(30) as never, {
		resumeModuleUrl: '/never-loads.js',
	});
	expect(stream.pendingArmCount).toBe(1);
	expect(stream.shell).not.toContain('Select all');
	const host = document.createElement('div');
	document.body.appendChild(host);
	const tail = document.createElement('div');
	document.body.appendChild(tail);
	try {
		host.innerHTML = stream.shell;
		runInlineScripts(host);
		expect(host.querySelector('[data-loading]')).not.toBeNull();
		const chunks: string[] = [];
		for await (const chunk of stream.appends()) {
			chunks.push(chunk);
			tail.insertAdjacentHTML('beforeend', chunk);
			runInlineScripts(tail);
		}
		expect(chunks.join('')).not.toMatch(/\s(?:indeterminate|scrolltop|volume)[=\s>]/i);
		await expect
			.poll(() => host.querySelector('[data-select-all]') !== null, { timeout: 5_000 })
			.toBe(true);
		const box = host.querySelector<HTMLInputElement>('[data-select-all]')!;
		const pane = host.querySelector<HTMLElement>('[data-pane]')!;
		const chime = host.querySelector<HTMLAudioElement>('[data-chime]')!;
		await expect
			.poll(() => [box.indeterminate, pane.scrollTop, chime.volume])
			.toEqual([true, 40, 0.25]);
		expect(
			(globalThis as { __marklessPropertySeeds?: unknown }).__marklessPropertySeeds,
		).toBeUndefined();
	} finally {
		tail.remove();
		host.remove();
		delete (globalThis as { __mArm?: unknown }).__mArm;
	}
});

test('a streamed arm without those members streams exactly what it did before', async () => {
	const stream = await renderToStream(
		inboxArtifact(10, '<p data-mail>3 unread</p>') as never,
		{},
	);
	let appended = '';
	for await (const chunk of stream.appends()) appended += chunk;
	expect(appended).toContain('<p data-mail>3 unread</p>');
	expect(appended).not.toContain('defineProperty');
});
