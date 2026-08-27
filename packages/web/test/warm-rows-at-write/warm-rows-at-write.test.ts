import { expect, test } from 'vitest';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import {
	renderRepeatRowComponent,
	type PrerenderDataSurface,
} from '../../src/prerender/evaluator.ts';

/**
 * What a component row's render costs the statement that asks for it.
 *
 * A row built AT the write has no statement to spare: the handler writes the
 * collection and reads the rows back on its next line. So these rows assert on
 * `typeof answer.then` rather than on any timing - a render that answers with a
 * promise is one the write cannot use, however fast that promise settles.
 *
 * The last row is RED BY DESIGN: it pins the one await left on the warm path,
 * in a file this work could not reach, so whoever removes it turns a documented
 * refusal into the answer instead of guessing.
 */

const isPromise = (value: unknown) =>
	typeof (value as { then?: unknown } | undefined)?.then === 'function';

function surface(): PrerenderDataSurface {
	return {
		rootComponentName: 'Page',
		renderData: {
			root: { componentName: 'Page', templateId: 'page' },
			chunks: [
				{
					id: 'page',
					kind: 'template',
					componentName: 'Page',
					statics: ['<ul>', '</ul>'],
					hosts: [
						{
							hostNodeId: 'list',
							tagName: 'ul',
							coordinate: { kind: 'child-index', path: [0] },
						},
					],
					slots: [],
				},
				{
					id: 'row',
					kind: 'template',
					componentName: 'Row',
					statics: ['<li>', '</li>'],
					hosts: [
						{
							hostNodeId: 'root',
							tagName: 'li',
							coordinate: { kind: 'child-index', path: [0] },
						},
					],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0, 0] },
							residue: { kind: 'graph-read', graphNodeId: 'prop:item', path: ['label'] },
						},
					],
				},
			],
			repeats: [],
			boundaries: [],
		} as unknown as PrerenderDataSurface['renderData'],
		components: {
			Page: {
				name: 'Page',
				rootChunkId: 'page',
				hostNodeIds: ['list'],
				state: { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] },
				view: emptyView(),
				edges: [
					{
						id: 'edge:row',
						childComponentName: 'Row',
						hostPrefix: 'c0:',
						symbolPrefix: 'c0:',
						props: [{ name: 'item', kind: 'serializable', value: undefined }],
					},
				],
			},
			Row: {
				name: 'Row',
				rootChunkId: 'row',
				hostNodeIds: ['root'],
				state: {
					version: ASYNC_PROTOCOL_VERSION,
					cells: [{ graphNodeId: 'state:open', name: 'open', valueKind: 'boolean' }],
					computed: [],
				},
				initialValues: [
					{ graphNodeId: 'state:open', value: { kind: 'constant', value: false } },
				],
				view: {
					...emptyView(),
					locators: [{ hostNodeId: 'root', index: 0, tagName: 'li' }],
				},
			},
		} as unknown as PrerenderDataSurface['components'],
		imports: {},
	};
}

function emptyView() {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function renderRow(input: {
	readonly rowKey: string;
	readonly enclosingWidgetRoots?: ReadonlyMap<string, string>;
	readonly loadSymbol?: (symbolId: string) => unknown;
}) {
	return renderRepeatRowComponent({
		surface: surface(),
		ownerComponentName: 'Page',
		componentEdgeId: 'edge:row',
		itemPropName: 'item',
		item: { id: input.rowKey, label: input.rowKey },
		rowKey: input.rowKey,
		rowIndex: 0,
		loadSymbol: input.loadSymbol ?? (() => undefined),
		read: () => undefined,
		...(input.enclosingWidgetRoots ? { enclosingWidgetRoots: input.enclosingWidgetRoots } : {}),
	});
}

test('a warm row render answers without a statement', () => {
	const answer = renderRow({ rowKey: 'a' });

	expect(isPromise(answer)).toBe(false);
	expect((answer as { html: string }).html).toContain('<li>a</li>');
});

test('a warm render and a promised one agree byte for byte', async () => {
	const warm = renderRow({ rowKey: 'a' }) as { html: string; view: unknown };
	const promised = await renderRow({
		rowKey: 'a',
		loadSymbol: (symbolId) => Promise.resolve(symbolId).then(() => undefined),
	});

	expect(promised.html).toBe(warm.html);
	expect(JSON.stringify(promised.view)).toBe(JSON.stringify(warm.view));
});

test('a refusal still answers as a rejection, not a throw', async () => {
	await expect(
		renderRepeatRowComponent({
			surface: surface(),
			ownerComponentName: 'Page',
			componentEdgeId: 'edge:absent',
			item: {},
			rowKey: 'a',
			rowIndex: 0,
			loadSymbol: () => undefined,
			read: () => undefined,
		}),
	).rejects.toThrowError(/MARKLESS_PRERENDER_CHILD_MISSING/);
});

// RED BY DESIGN. A row's ancestor widgets are installed for its render by
// `marklessWithEnclosingWidgetRoots` in fns/instance-scope.ts, an async function:
// it hands back a promise however warm the render inside it is, so a row inside
// any live widget still cannot be built at the write. Flip this to `test` when
// that holder takes the then-or-continue spelling the renderer, the seed pass and
// the evaluator now use.
test('a row inside a live widget answers without a statement', () => {
	const answer = renderRow({
		rowKey: 'a',
		enclosingWidgetRoots: new Map([['shared:ccr', 'w0:']]),
	});

	expect(isPromise(answer)).toBe(false);
});
