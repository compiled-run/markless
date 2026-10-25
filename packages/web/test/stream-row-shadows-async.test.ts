import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { marklessSsrRunAsyncComputed } from '../src/fns/ssr.ts';
import { renderToStream } from '../src/render-to-stream.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function compiledPage(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });
	const errors = Object.values(compiled).flatMap((artifact) =>
		(
			(artifact as { diagnostics?: ReadonlyArray<{ severity: string; code: string }> })
				?.diagnostics ?? []
		).filter((diagnostic) => diagnostic.severity === 'error'),
	);
	expect(errors).toEqual([]);
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) =>
			`from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`
	)) as { readonly marklessRenderSsr: (...args: unknown[]) => unknown };
	return { renderSsr: loaded.marklessRenderSsr };
}

async function drainWithin(appends: AsyncGenerator<string>, ms: number): Promise<string> {
	const chunks: string[] = [];
	const drained = (async () => {
		for await (const chunk of appends) chunks.push(chunk);
	})();
	const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));
	if ((await Promise.race([drained, timedOut])) === 'timeout')
		throw new Error(`appends did not finish within ${ms}ms`);
	return chunks.join('');
}

const LATER = `function later(value, ms) {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}`;

for (const shape of [
	{ name: 'a derived list', collection: 'rows', key: 'item.id', text: 'item.text' },
	{ name: 'the async list itself', collection: 'list', key: 'item', text: 'item' },
]) {
	test(`a @for row named like an async computed streams both, looping over ${shape.name}`, async () => {
		const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
export function Shelf() @{
	const list = computed(async () => later(['one', 'two'], 30));
	const rows = computed(() => (Array.isArray(list) ? list : []).map((word, i) => ({ id: i, text: word })));
	const item = computed(async () => later({ text: 'the item' }, 50));

	<main>
		<ul>
			@try {
				@for (const item of ${shape.collection}; key ${shape.key}) {
					<li data-row>{${shape.text}}</li>
				}
			} @pending {
				<li>pending rows</li>
			}
		</ul>
		@try {
			<p data-item>{item.text}</p>
		} @pending {
			<p>pending item</p>
		}
	</main>
}
`);
		const stream = await renderToStream(page as never, {});
		expect(stream.shell).toContain('pending rows');
		const settled = await drainWithin(stream.appends(), 2_000);
		expect(settled).toContain('<li data-row="">one</li><li data-row="">two</li>');
		expect(settled).toContain('<p data-item="">the item</p>');
	});
}

test('a boundary whose value settled but whose re-render never takes its arm fails the stream instead of re-rendering forever', async () => {
	let renders = 0;
	// The runner settles, but every render reports the boundary pending and no snapshot for it.
	const stuck = {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			renders++;
			await marklessSsrRunAsyncComputed(
				[] as never,
				'computed:stuck',
				() => new Promise((resolve) => setTimeout(() => resolve('done'), 30)),
				renderContext,
				true,
			);
			const arm = '<p>waiting</p>';
			return {
				html: `<main><!--markless:async:boundary:0-->${arm}<!--/markless:async:boundary:0--></main>`,
				structure: { anchors: [{ kind: 'async', id: 'boundary:0', html: arm }] },
				state: { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] },
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [
						{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' },
					],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'boundary:0',
							runnerGraphNodeId: 'computed:stuck',
							initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
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
	const stream = await renderToStream(stuck as never, {});
	expect(stream.pendingArmCount).toBe(1);
	await expect(drainWithin(stream.appends(), 2_000)).rejects.toThrow(
		'MARKLESS_STREAM_ARM_RENDER_MISSING',
	);
	expect(renders).toBeLessThan(10);
});
