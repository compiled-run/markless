import { expect, test } from 'vitest';
import {
	marklessScalarLocate,
	marklessScalarServedOwner,
	marklessScalarServedPrime,
	type MarklessScalarOwner,
} from '../src/fns/scalar-served.ts';
import { marklessDecodeScalarCell } from '../src/fns/scalar-specialized.ts';

type FakeNode = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly children: FakeNode[];
	parent?: FakeNode;
	contains(node: FakeNode): boolean;
};

function node(tagName: string, children: FakeNode[] = []): FakeNode {
	const created: FakeNode = {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		children,
		contains(other) {
			for (let current: FakeNode | undefined = other; current; current = current.parent)
				if (current === created) return true;
			return false;
		},
	};
	for (const child of children) child.parent = created;
	return created;
}

function container(tree: FakeNode, view: unknown, overlayOpen = false) {
	const census: FakeNode[] = [];
	const walk = (current: FakeNode) => {
		census.push(current);
		current.children.forEach(walk);
	};
	walk(tree);
	const script = { textContent: JSON.stringify(view) };
	return Object.assign(tree, {
		__marklessCensus: census,
		querySelector(selector: string) {
			if (selector === 'script[type="markless/view"]') return script;
			if (selector === '[overlay]:not([hidden])') return overlayOpen ? {} : null;
			return null;
		},
	}) as unknown as Element;
}

function page(input: {
	readonly events: ReadonlyArray<{ hostNodeId: string; eventName: string; symbolIds: string[] }>;
	readonly behaviors?: ReadonlyArray<{ hostNodeId: string }>;
	readonly elementHandles?: ReadonlyArray<{ hostNodeId: string }>;
	readonly keyedRepeats?: unknown;
	readonly overlayOpen?: boolean;
}) {
	const label = node('span');
	const tap = node('button', [label]);
	const other = node('button');
	const panel = node('section', [tap, other]);
	const root = node('main', [panel]);
	const view = {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 4, tagName: 'button' },
		],
		events: input.events,
		behaviors: input.behaviors ?? [],
		elementHandles: input.elementHandles ?? [],
		keyedRepeats: input.keyedRepeats ?? [],
		branches: [],
		asyncBoundaries: [],
	};
	return {
		root: container(root, view, input.overlayOpen),
		tap,
		label,
		other,
		panel,
	};
}

const owners: MarklessScalarOwner[] = [
	['h1', 'click', 'symbol:tap'],
	['h0', 'click', 'symbol:panel'],
];
const tapEvent = { hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:tap'] };
const click = (target: FakeNode, bubbles = true) =>
	({ type: 'click', target, bubbles }) as unknown as Event;

test('the only markless handler on the path owns the event', () => {
	const { root, tap, label } = page({
		events: [tapEvent, { hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:other'] }],
	});
	expect(marklessScalarServedOwner(root, click(tap), owners)).toBe(0);
	expect(marklessScalarServedOwner(root, click(label), owners)).toBe(0);
	expect(marklessScalarLocate(root, 'h1', -1, 'button')).toBe(tap);
});

test.each([
	[
		'an ancestor handler shares the path',
		{
			events: [
				tapEvent,
				{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:panel'] },
			],
		},
	],
	[
		'an element handle sits on the path',
		{ events: [tapEvent], elementHandles: [{ hostNodeId: 'h1' }] },
	],
	['a behavior sits on an ancestor', { events: [tapEvent], behaviors: [{ hostNodeId: 'h0' }] }],
	['an overlay is shown', { events: [tapEvent], overlayOpen: true }],
	[
		'the owning record is not a lean action',
		{ events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:elsewhere'] }] },
	],
])('hands the event to full resume when %s', (_reason, input) => {
	const { root, tap } = page(input);
	expect(marklessScalarServedOwner(root, click(tap), owners)).toBe(-1);
});

test('row handlers of the same event name may sit inside a lean host below the target', () => {
	const input = {
		events: [tapEvent],
		keyedRepeats: [{ rowEvents: [{ hostNodeId: 'r0', eventName: 'click', symbolIds: [] }] }],
	};
	const { root, tap, label } = page(input);
	expect(marklessScalarServedOwner(root, click(tap), owners)).toBe(0);
	expect(marklessScalarServedOwner(root, click(label), owners)).toBe(-1);
});

test('a non-bubbling event is owned only by its own target', () => {
	const { root, label } = page({ events: [tapEvent] });
	expect(marklessScalarServedOwner(root, click(label, false), owners)).toBe(-1);
});

test('priming a lean host warms only its lean actions', () => {
	const { root, tap, other } = page({
		events: [tapEvent, { hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:other'] }],
	});
	expect(marklessScalarServedPrime(root, tap as unknown as Element, owners)).toEqual([0]);
	expect(marklessScalarServedPrime(root, other as unknown as Element, owners)).toBeUndefined();
	const withHandle = page({ events: [tapEvent], elementHandles: [{ hostNodeId: 'h1' }] });
	expect(
		marklessScalarServedPrime(withHandle.root, withHandle.tap as unknown as Element, owners),
	).toBeUndefined();
});

test('a cell the compiler could not type decodes when its served value is a scalar', () => {
	const cell = (root: unknown, records: unknown[] = []) => ({
		graphNodeId: 'state:count',
		valueKind: 'unknown',
		value: { version: 1, root, records },
	});
	expect(marklessDecodeScalarCell(cell(4), 'state:count', 'site')).toBe(4);
	expect(() => marklessDecodeScalarCell(cell({ $ref: 0 }, [{}]), 'state:count', 'site')).toThrow(
		expect.objectContaining({ code: 'MARKLESS_SCALAR_SPECIALIZED_ESCALATE' }),
	);
});
