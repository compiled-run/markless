import { expect, test } from 'vitest';
import { renderToStream } from '@markless/web/render-to-stream';
import {
	marklessSsrAttachSnapshots,
	marklessSsrRunAsyncComputed,
} from '@markless/web/fns/ssr';

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
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' }],
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
							armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
						},
					],
				},
			} as never;
		},
	};
}

function runInlineScripts(host: HTMLElement): void {
	for (const script of host.querySelectorAll('script:not([type])')) {
		// Streamed executor scripts run on parse in a real stream; the test
		// injects them via innerHTML (inert), so it executes them explicitly.
		new Function(script.textContent ?? '')();
	}
}

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

			// Settled content committed between the boundary's own anchors.
			expect(host.querySelector('[data-signal]')?.textContent).toBe('Signal locked');
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
