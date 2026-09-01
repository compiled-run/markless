import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { transformMdxRoute } from '../../router/src/vite/mdx.ts';
import {
	createMdxRenderDataSurface,
	type MdxRoutePart,
} from '../../router/src/vite/runtime/mdx-route.ts';
import {
	protocolIslandSegment,
	protocolRowSegment,
} from '../../serializer/src/protocol-constants.ts';
import { marklessRowComponentMint } from '../src/fns/row-component-mint.ts';
import {
	marklessOwningSurface,
	renderRepeatRowComponent,
	type PrerenderDataSurface,
} from '../src/prerender/evaluator.ts';
import type { ResumeDomElement, ResumeKeyedRepeatRecord } from '../src/resume-types.ts';

/**
 * A component row on a page composed out of ISLANDS.
 *
 * The `@for` is authored inside an island, so two things the single-module path
 * never had to answer come up at once: the container has to be resumed with a
 * render-data surface at all - the composed route's resume entry is the only
 * place one exists - and the surface it hands over is the PAGE's, whose own
 * components map holds the route and nothing else. The component that owns the
 * row lives one import down, under the island's prefix, and the row's symbols
 * have to be spelled in that prefix or the island's loader never answers them.
 */

const ISLAND = protocolIslandSegment(0);

test('a composed route resumes its container with the page render-data surface', async () => {
	const route = await transformMdxRoute(
		'import Island from "./island.tsrx";\n\n<Island />\n',
		'/src/pages/demo.mdx',
	);
	const resumeEntry = route.slice(route.indexOf('export async function resumeContainerEvent'));

	expect(resumeEntry).toContain('renderData: marklessMdxRenderData');
});

test('a row component owned by an island is reached through the composed page surface', async () => {
	const owner = marklessOwningSurface(composedPage(), 'Island');

	expect(owner?.symbolPrefix).toBe(ISLAND);
	const rendered = await renderRepeatRowComponent({
		surface: owner!.surface,
		ownerComponentName: 'Island',
		componentEdgeId: 'edge:row',
		itemPropName: 'item',
		item: { id: 'a', label: 'alpha' },
		rowKey: 'a',
		rowIndex: 0,
		symbolPrefix: owner!.symbolPrefix,
		loadSymbol: () => undefined,
		read: () => undefined,
	});

	expect(rendered.html).toBe('<li>alpha<button>x</button></li>');
});

test("a minted island row spells its symbols in the island's own prefix", async () => {
	const page = fixture();

	await page.rows(['a']);

	expect(page.symbolIds()).toEqual([
		`${ISLAND}${protocolRowSegment(`${ISLAND}a`)}c0:symbol:toggle`,
	]);
});

test('a key that changes after resume mints the new row and drops the old one', async () => {
	const page = fixture();
	await page.rows(['a']);
	expect(page.labelOf('a')).toBe('alpha');

	await page.rows(['b']);

	expect(page.labelOf('b')).toBe('bravo');
	expect(page.rowFor('a')).toBeUndefined();
});

type Item = { readonly id: string; readonly label: string };
const ITEMS: Readonly<Record<string, Item>> = {
	a: { id: 'a', label: 'alpha' },
	b: { id: 'b', label: 'bravo' },
};

/**
 * The mint as the resume runtime holds it: bound to one container's graph, page
 * and registrar, driven the way `wireKeyedRepeats` drives it - build every
 * unserved key, then place what came back.
 */
function fixture() {
	const list = el('UL');
	list.ownerDocument = { createElement: () => templateElement() };
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: `${ISLAND}state:rows`, value: [ITEMS.a] }],
	});
	const armRecords: Array<{ readonly symbolIds: ReadonlyArray<string> }> = [];
	const mint = marklessRowComponentMint(
		() => composedPage(),
		graph as never,
		{
			runtimeInput: { loadSymbol: () => undefined },
			armRegistrationDeps: (records) => {
				for (const event of records.events ?? []) armRecords.push(event);
				return Promise.reject(new Error('registration stops at the records'));
			},
			installArmEventType: () => undefined,
			elementsByHostId: new Map(),
		} as never,
	);
	const served = new Map<unknown, ResumeDomElement>();
	return {
		async rows(keys: ReadonlyArray<string>) {
			graph.write({
				graphNodeId: `${ISLAND}state:rows`,
				value: keys.map((key) => ITEMS[key]),
			});
			const commit = await mint.rows(REPEAT, list as never, served);
			for (const key of keys) {
				const row = mint.mintRow(list as never, REPEAT, ITEMS[key]);
				if (row) served.set(key, row);
			}
			const gone = [...served.keys()].filter((key) => !keys.includes(key as string));
			for (const key of gone) served.delete(key);
			await commit().catch(() => undefined);
		},
		rowFor: (key: string) => served.get(key),
		labelOf: (key: string) => textOf((served.get(key) as unknown as Node)?.childNodes[0]),
		symbolIds: () => armRecords.flatMap((record) => [...record.symbolIds]),
	};
}

const REPEAT = {
	id: `${ISLAND}repeat:0`,
	parentHostNodeId: `${ISLAND}list`,
	ownerHostNodeId: `${ISLAND}list`,
	instancePath: ISLAND,
	collectionGraphNodeId: `${ISLAND}state:rows`,
	collectionPath: [],
	keyPath: ['id'],
	itemName: 'row',
	rowElementCount: 3,
	rowComponent: { componentEdgeId: 'edge:row', componentName: 'Island', itemPropName: 'item' },
	rowEvents: [],
} as unknown as ResumeKeyedRepeatRecord;

/** The page an MDX route composes from one island child - the shape resume hands the mint. */
function composedPage(): PrerenderDataSurface {
	const parts: ReadonlyArray<MdxRoutePart> = [{ kind: 'component', componentIndex: 0 }];
	return createMdxRenderDataSurface(parts, [
		{
			componentIndex: 0,
			hostPrefix: ISLAND,
			symbolPrefix: ISLAND,
			props: {},
			surface: islandSurface() as never,
		},
	]) as unknown as PrerenderDataSurface;
}

function islandSurface(): PrerenderDataSurface {
	return {
		rootComponentName: 'Island',
		renderData: {
			root: { componentName: 'Island', templateId: 'island' },
			chunks: [
				{
					id: 'island',
					kind: 'template',
					componentName: 'Island',
					statics: ['<ul></ul>'],
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
					statics: ['<li>', '<button>x</button></li>'],
					hosts: [
						{
							hostNodeId: 'root',
							tagName: 'li',
							coordinate: { kind: 'child-index', path: [0] },
						},
						{
							hostNodeId: 'act',
							tagName: 'button',
							coordinate: { kind: 'child-index', path: [0, 1] },
						},
					],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0, 0] },
							residue: {
								kind: 'graph-read',
								graphNodeId: 'prop:item',
								path: ['label'],
							},
						},
					],
				},
			],
			repeats: [],
			boundaries: [],
		} as unknown as PrerenderDataSurface['renderData'],
		components: {
			Island: {
				name: 'Island',
				rootChunkId: 'island',
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
				hostNodeIds: ['root', 'act'],
				state: { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] },
				view: {
					...emptyView(),
					locators: [
						{ hostNodeId: 'root', index: 0, tagName: 'li' },
						{ hostNodeId: 'act', index: 1, tagName: 'button' },
					],
					events: [
						{ hostNodeId: 'act', eventName: 'click', symbolIds: ['symbol:toggle'] },
					],
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

type Node = {
	nodeType: number;
	tagName?: string;
	data?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	ownerDocument?: unknown;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
};

function el(tagName: string): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: [] };
	node.insertBefore = (fresh, before) => {
		const at = before ? node.childNodes.indexOf(before) : -1;
		if (at >= 0) node.childNodes.splice(at, 0, fresh);
		else node.childNodes.push(fresh);
		fresh.parentElement = node;
		return fresh;
	};
	node.removeChild = (gone) => {
		const at = node.childNodes.indexOf(gone);
		if (at >= 0) node.childNodes.splice(at, 1);
		gone.parentElement = null;
		return gone;
	};
	return node;
}

function textOf(node: Node | undefined): string {
	if (!node) return '';
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

// The one DOM service the mint asks for: a template whose innerHTML parses.
function templateElement() {
	let content: { childNodes: Node[] } = { childNodes: [] };
	return {
		set innerHTML(html: string) {
			content = { childNodes: parseHtml(html) };
		},
		get content() {
			return content;
		},
	};
}

function parseHtml(html: string): Node[] {
	const roots: Node[] = [];
	const open: Node[] = [];
	const place = (node: Node) => {
		const parent = open[open.length - 1];
		if (!parent) return void roots.push(node);
		parent.childNodes.push(node);
		node.parentElement = parent;
	};
	for (const token of html.match(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g) ?? []) {
		if (token.startsWith('<!--'))
			place({ nodeType: 8, data: token.slice(4, -3), childNodes: [] });
		else if (token.startsWith('</')) open.pop();
		else if (token.startsWith('<')) {
			const node = el(/<([a-zA-Z0-9-]+)/.exec(token)?.[1]?.toUpperCase() ?? 'DIV');
			place(node);
			if (!token.endsWith('/>')) open.push(node);
		} else place({ nodeType: 3, data: token, childNodes: [] });
	}
	return roots;
}
