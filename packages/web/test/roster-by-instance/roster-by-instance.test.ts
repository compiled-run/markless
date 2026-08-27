import { expect, test } from 'vitest';
import {
	fileBoundElementHandles,
	marklessElementBoundKey,
	MARKLESS_ELEMENT_BOUND_KEY_PREFIX,
} from '../../src/fns/element-handle-roster.ts';
import type {
	PrerenderDataDefinition,
	PrerenderDataSurface,
} from '../../src/prerender/evaluator.ts';
import {
	MARKLESS_WIDGET_INSTANCE_KEY,
	marklessWidgetInstanceKey,
} from '../../src/prerender/shared-seed-slot.ts';

// The menu shape in miniature: an outer family rooted by `Bar`, an inner family
// rooted by every `Item`, and the `Content` part written inside one item. The
// enclosing widget's seed walk descends THROUGH the nested root and reaches the
// inner family's handle, so the entry it files must carry its own token.
const BAR = 'shared:src/menu.tsrx#barState';
const ITEM = 'shared:src/menu.tsrx#itemState';
const BAR_EL = `${BAR}/element:barEl`;
const ITEM_EL = `${ITEM}/element:itemEl`;
const CONTENT_EL = `${ITEM}/element:contentEl`;

function surface(
	components: Record<string, Partial<PrerenderDataDefinition>>,
	chunks: ReadonlyArray<unknown>,
): PrerenderDataSurface {
	return { components, imports: {}, renderData: { chunks } } as unknown as PrerenderDataSurface;
}

function chunk(id: string, componentName: string, slots: ReadonlyArray<unknown>) {
	return { id, kind: 'component-projection', componentName, statics: [], hosts: [], slots };
}

function childSlot(componentEdgeId: string, projectionChunkId?: string) {
	return { kind: 'child-component', componentEdgeId, projectionChunkId };
}

/**
 * `Page` places `Bar`, whose projection holds `Item` (the nesting one), whose
 * own projection holds `Content`. Every component's handles are declared on its
 * definition the way the compiled `boundElementHandles` field declares them.
 */
const page = surface(
	{
		Page: { name: 'Page' },
		Bar: { name: 'Bar', boundElementHandles: [BAR_EL] },
		Item: { name: 'Item', boundElementHandles: [ITEM_EL] },
		Content: { name: 'Content', boundElementHandles: [CONTENT_EL] },
	},
	[
		chunk('projection:bar', 'Page', [childSlot('edge:item', 'projection:item')]),
		chunk('projection:item', 'Page', [childSlot('edge:content')]),
	],
);

const pageDefinition = {
	name: 'Page',
	edges: [
		{ id: 'edge:bar', childComponentName: 'Bar' },
		{ id: 'edge:item', childComponentName: 'Item' },
		{ id: 'edge:content', childComponentName: 'Content' },
	],
} as unknown as PrerenderDataDefinition;

/**
 * The seed map an open widget instance carries: everything inherited from the
 * scope it was placed in, then its own token under the plain key and its family.
 * `seedProjectingChild` builds exactly this map before it files the roster.
 */
function open(
	token: string,
	definitionId: string,
	inherited?: ReadonlyMap<string, unknown>,
): Map<string, unknown> {
	const seeds = new Map<string, unknown>(inherited ?? []);
	seeds.set(MARKLESS_WIDGET_INSTANCE_KEY, token);
	seeds.set(marklessWidgetInstanceKey(definitionId), token);
	return seeds;
}

test('the enclosing widget files the inner family handle under its OWN token', () => {
	const filed = fileBoundElementHandles(
		open('bar-1', BAR),
		undefined,
		page,
		pageDefinition,
		{ componentEdgeId: 'edge:bar', projectionChunkId: 'projection:bar' },
	);

	expect(filed?.get(marklessElementBoundKey('bar-1', BAR_EL))).toBe(true);
	// Reached by walking through the nested root, so filed - but named as bar-1's.
	expect(filed?.get(marklessElementBoundKey('bar-1', CONTENT_EL))).toBe(true);
	expect(filed?.get(`${MARKLESS_ELEMENT_BOUND_KEY_PREFIX}${CONTENT_EL}`)).toBeUndefined();
});

test('a nested instance that binds nothing reads unbound through the inherited map', () => {
	const inherited = fileBoundElementHandles(
		open('bar-1', BAR),
		undefined,
		page,
		pageDefinition,
		{ componentEdgeId: 'edge:bar', projectionChunkId: 'projection:bar' },
	);

	// A plain item: its own projection places no `Content`, so its walk reaches
	// no content handle. It still starts from the enclosing widget's map.
	const plain = fileBoundElementHandles(
		open('item-plain', ITEM, inherited),
		inherited,
		page,
		pageDefinition,
		{ componentEdgeId: 'edge:item', projectionChunkId: 'projection:empty' },
	);

	// The question the compiled reader asks, in the plain item's own token.
	expect(plain?.get(marklessElementBoundKey('item-plain', CONTENT_EL))).toBeUndefined();
	expect(plain?.get(marklessElementBoundKey('item-plain', ITEM_EL))).toBe(true);
	// The inherited entry survives, naming the widget that filed it.
	expect(plain?.get(marklessElementBoundKey('bar-1', CONTENT_EL))).toBe(true);
});

test('the item that places the content part files it under that item token', () => {
	const nesting = fileBoundElementHandles(
		open('item-nesting', ITEM),
		undefined,
		page,
		pageDefinition,
		{ componentEdgeId: 'edge:item', projectionChunkId: 'projection:item' },
	);

	expect(nesting?.get(marklessElementBoundKey('item-nesting', CONTENT_EL))).toBe(true);
	expect(nesting?.get(marklessElementBoundKey('item-plain', CONTENT_EL))).toBeUndefined();
});

test('a handle of a family with no filed token falls back to the plain one', () => {
	const seeded = new Map<string, unknown>([[MARKLESS_WIDGET_INSTANCE_KEY, 'outer-1']]);
	const filed = fileBoundElementHandles(seeded, undefined, page, pageDefinition, {
		componentEdgeId: 'edge:item',
		projectionChunkId: 'projection:item',
	});

	expect(filed?.get(marklessElementBoundKey('outer-1', CONTENT_EL))).toBe(true);
});
