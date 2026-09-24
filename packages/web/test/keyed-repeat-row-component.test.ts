import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import {
	ASYNC_PROTOCOL_VERSION,
	createProtocolStatePayload,
	renderPayloadScripts,
} from '@markless/serializer';
import { decodePayloadScripts } from '../../serializer/src/protocol-client-storage.ts';
import { resumePrerenderTriggerGroup } from '../src/fns/prerender-trigger-resume.ts';
import { marklessRowComponentMint } from '../src/fns/row-component-mint.ts';
import { wireKeyedRepeats } from '../src/resume-keyed-repeats.ts';
import type { ResumeDomElement, ResumeViewRecord } from '../src/resume-types.ts';

type Node = {
	nodeType: number;
	tagName?: string;
	data?: string;
	childNodes: Node[];
	parentElement?: Node | null;
	insertBefore?: (node: Node, before: Node | null) => unknown;
	removeChild?: (node: Node) => unknown;
	__marklessCensus?: Node[];
};

function el(tagName: string, children: Node[] = []): Node {
	const node: Node = { nodeType: 1, tagName, childNodes: [] };
	node.childNodes = children;
	for (const child of children) child.parentElement = node;
	node.insertBefore = (fresh, before) => {
		const held = node.childNodes.indexOf(fresh);
		if (held >= 0) node.childNodes.splice(held, 1);
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

function txt(data: string): Node {
	return { nodeType: 3, data, childNodes: [] };
}

function textOf(node: Node): string {
	return node.nodeType === 3 ? (node.data ?? '') : node.childNodes.map(textOf).join('');
}

function elementsUnder(node: Node): Node[] {
	return [
		...(node.nodeType === 1 ? [node] : []),
		...node.childNodes.flatMap((child) => elementsUnder(child)),
	];
}

function componentRow(label: string): Node {
	return el('LI', [el('SPAN', [txt(label)]), el('BUTTON')]);
}

type MintCall = {
	readonly rowKey: unknown;
	readonly item: unknown;
	readonly host: BridgeHost;
	readonly page: unknown;
};

let bridge: { readonly mints: MintCall[]; readonly commits: unknown[] } = {
	mints: [],
	commits: [],
};
type BridgeHost = { readonly wired?: boolean; readonly id?: string } | undefined;
let wiredBridge = true;
(
	globalThis as {
		__marklessRowMint?: (
			renderData?: () => unknown,
			graph?: unknown,
			host?: BridgeHost,
		) => Promise<unknown>;
	}
).__marklessRowMint = async (renderData, graph, host) => {
	const own = bridge,
		wired = wiredBridge,
		page = renderData?.();
	let prepared = new Map<unknown, Node>();
	return {
		mintRow(_parent: Node, _repeat: unknown, item: { readonly id: string }) {
			return prepared.get(item.id);
		},
		async rows(
			repeat: { readonly collectionGraphNodeId: string },
			_parent: Node,
			served: ReadonlyMap<unknown, Node>,
		) {
			prepared = new Map();
			const items = wired
				? ((graph as { read: (id: string, path: never[]) => unknown }).read(
						repeat.collectionGraphNodeId,
						[],
					) as ReadonlyArray<{ readonly id: string; readonly label: string }>)
				: [];
			for (const item of items) {
				if (served.has(item.id) || prepared.has(item.id)) continue;
				own.mints.push({ rowKey: item.id, item, host, page });
				prepared.set(item.id, componentRow(item.label));
			}
			const minted = [...prepared];
			return async () => {
				prepared = new Map();
				for (const [rowKey, rowRoot] of minted)
					own.commits.push({ rowKey, attached: rowRoot.parentElement !== null });
			};
		},
	};
};

function fixture(
	options: {
		readonly wired?: boolean;
		readonly host?: BridgeHost;
		readonly page?: unknown;
	} = {},
) {
	const served = [
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	];
	const rows = served.map((item) => componentRow(item.label));
	const header = el('LI', [txt('header')]);
	const footer = el('LI', [txt('footer')]);
	const list = el('UL', [header, ...rows, footer]);
	const root = el('SECTION', [list]);
	root.__marklessCensus = elementsUnder(root);
	const mints: MintCall[] = [];
	const commits: unknown[] = [];
	bridge = { mints, commits };
	wiredBridge = options.wired !== false;
	const view = {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'row',
				rowElementCount: 3,
				rowStartOffset: 1,
				rowComponent: {
					componentEdgeId: 'edge:row',
					componentName: 'Page',
					itemPropName: 'item',
				},
				rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }],
			},
		],
	} as unknown as ResumeViewRecord;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: served }] });
	const registered: Array<{ readonly host: Node; readonly rowKey: unknown }> = [];
	const bridgeHost = options.host ?? { wired: true };
	wireKeyedRepeats(
		{
			graph,
			view,
			elementsByHostId: new Map<string, ResumeDomElement>([
				['h0', list as unknown as ResumeDomElement],
			]),
			events: {
				addRowEvent: (host: Node, match: { readonly rowKey: unknown }) =>
					registered.push({ host, rowKey: match.rowKey }),
			} as never,
			storeContainerSubscription: () => undefined,
			renderData: (() => options.page ?? { page: 'default' }) as never,
		},
		options.wired === false ? undefined : (bridgeHost as never),
	);
	return {
		graph,
		bridgeHost,
		list,
		root,
		mints,
		commits,
		registered,
		footer,
		labels: () => list.childNodes.map(textOf),
		census: () => root.__marklessCensus!,
		write: async (value: ReadonlyArray<{ readonly id: string; readonly label: string }>) => {
			graph.write({ graphNodeId: 'state:rows', value });
			await graph.flush();
		},
	};
}

const GROWN = [
	{ id: 'a', label: 'alpha' },
	{ id: 'b', label: 'bravo' },
	{ id: 'c', label: 'charlie' },
];

test('a staged group supplies its own render data when an interaction creates a row', async () => {
	const list = el('UL');
	const root = el('SECTION', [list]);
	const mints: MintCall[] = [];
	const commits: unknown[] = [];
	bridge = { mints, commits };
	wiredBridge = true;
	const page = { page: 'staged-collection' };
	let renderDataCalls = 0;
	const records = decodePayloadScripts(
		renderPayloadScripts({
			state: createProtocolStatePayload({
				cells: [{ graphNodeId: 'state:rows', name: 'rows', valueKind: 'array', value: [] }],
			}),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [{ hostNodeId: 'list', strategy: 'dom-order', index: 1, tagName: 'ul' }],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:rows',
						parentHostNodeId: 'list',
						collectionGraphNodeId: 'state:rows',
						collectionPath: [],
						keyPath: ['id'],
						itemName: 'item',
						rowElementCount: 3,
						rowComponent: {
							componentEdgeId: 'edge:row',
							componentName: 'Page',
							itemPropName: 'item',
						},
						rowEvents: [],
					},
				],
			},
		}),
	);
	const resumed = await resumePrerenderTriggerGroup({
		...records,
		root: root as ResumeDomElement,
		groupId: 'rows',
		graphNodeIds: ['state:rows'],
		loadSymbol: () => () => undefined,
		renderData: (() => {
			renderDataCalls++;
			return page;
		}) as never,
	});
	expect(renderDataCalls).toBe(1);
	resumed.graph.write({ graphNodeId: 'state:rows', value: [GROWN[0]] });
	await resumed.graph.flush();
	expect(list.childNodes.map(textOf)).toEqual(['alpha']);
	expect(mints).toHaveLength(1);
	expect(mints[0]!.page).toBe(page);
	expect(renderDataCalls).toBe(1);
	expect(commits).toEqual([{ rowKey: 'a', attached: true }]);
});

test('an unserved key routes to the component bridge and lands in the row span', async () => {
	const { labels, write, list, footer, mints } = fixture();
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);

	await write(GROWN);

	expect(mints.map((mint) => mint.rowKey)).toEqual(['c']);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
	expect(list.childNodes.at(-1)).toBe(footer);
});

test('a minted component row enters the pinned census in document order', async () => {
	const { census, write, root } = fixture();
	const before = census().length;

	await write(GROWN);

	expect(census().length).toBe(before + 3);
	expect(census()).toEqual(elementsUnder(root));
});

test('a minted component row registers after it is attached', async () => {
	const { write, commits } = fixture();

	await write(GROWN);

	expect(commits).toEqual([{ rowKey: 'c', attached: true }]);
});

test('a minted component row is wired for the same row events a served row is', async () => {
	const { registered, write, list } = fixture();
	expect(registered.map((entry) => entry.rowKey)).toEqual(['a', 'b']);

	await write(GROWN);

	const minted = list.childNodes[3]!;
	const last = registered.at(-1)!;
	expect(last.rowKey).toBe('c');
	expect(last.host).toBe(minted.childNodes[1]);
	expect(last.host.tagName).toBe('BUTTON');
});

test('a component key that comes back reuses its parked row and never mints twice', async () => {
	const { write, mints, commits, list, labels } = fixture();

	await write(GROWN);
	const minted = list.childNodes[3]!;
	await write([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
	]);
	await write(GROWN);

	expect(mints.map((mint) => mint.rowKey)).toEqual(['c']);
	expect(commits).toHaveLength(1);
	expect(list.childNodes[3]).toBe(minted);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
});

test('a second container mints through its own registrar', async () => {
	const first = fixture({ host: { id: 'first' } });
	const second = fixture({ host: { id: 'second' } });

	await first.write(GROWN);
	await second.write(GROWN);

	expect(first.mints.map((mint) => mint.host)).toEqual([first.bridgeHost]);
	expect(second.mints.map((mint) => mint.host)).toEqual([second.bridgeHost]);
	expect(second.mints[0]!.host).toBe(second.bridgeHost);
	expect(second.labels()).toEqual(['header', 'alpha', 'bravo', 'charlie', 'footer']);
});

test('each container mints against the page it was wired with', async () => {
	const first = fixture({ host: { id: 'first' }, page: { page: 'first' } });
	const second = fixture({ host: { id: 'second' }, page: { page: 'second' } });

	await first.write(GROWN);
	await second.write(GROWN);

	expect(first.mints.map((mint) => mint.page)).toEqual([{ page: 'first' }]);
	expect(second.mints.map((mint) => mint.page)).toEqual([{ page: 'second' }]);
});

test('a record naming a row component with no bridge wired leaves the key unrendered', async () => {
	const { write, labels, mints } = fixture({ wired: false });

	await write(GROWN);

	expect(mints).toEqual([]);
	expect(labels()).toEqual(['header', 'alpha', 'bravo', 'footer']);
});

test('the real bridge refuses a component row when no page reached the container', async () => {
	const mint = marklessRowComponentMint(undefined, { read: () => [] } as never, {} as never);

	await expect(
		mint.rows(
			{ id: 'repeat:0', keyPath: ['id'], rowComponent: { componentName: 'Page' } } as never,
			{} as never,
			new Map(),
		),
	).rejects.toThrow('MARKLESS_REPEAT_ROW_COMPONENT_SURFACE_MISSING');
});
