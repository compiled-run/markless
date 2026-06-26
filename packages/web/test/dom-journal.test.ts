import { expect, test } from 'vitest';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import { applyDomJournalEntries } from '../src/index.ts';

type FakeElement = {
	textContent: string;
	disabled: boolean;
	readonly attributes: Map<string, string>;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
};

function element(): FakeElement {
	return {
		textContent: '',
		disabled: false,
		attributes: new Map(),
		setAttribute(name, value) {
			this.attributes.set(name, value);
		},
		removeAttribute(name) {
			this.attributes.delete(name);
		},
	};
}

type FakeRangeNode = {
	readonly name: string;
	parentNode: FakeRangeParent | null;
};

type FakeRangeParent = {
	childNodes: FakeRangeNode[];
	insertBefore(node: FakeRangeNode, before: FakeRangeNode | null): FakeRangeNode;
	removeChild(node: FakeRangeNode): FakeRangeNode;
};

function rangeNode(name: string): FakeRangeNode {
	return {
		name,
		parentNode: null,
	};
}

function rangeParent(childNodes: FakeRangeNode[]): FakeRangeParent {
	const parent: FakeRangeParent = {
		childNodes: [],
		insertBefore(node, before) {
			const currentIndex = this.childNodes.indexOf(node);
			if (currentIndex >= 0) this.childNodes.splice(currentIndex, 1);

			const beforeIndex = before === null ? -1 : this.childNodes.indexOf(before);
			const insertIndex = beforeIndex >= 0 ? beforeIndex : this.childNodes.length;
			this.childNodes.splice(insertIndex, 0, node);
			node.parentNode = this;
			return node;
		},
		removeChild(node) {
			this.childNodes = this.childNodes.filter((child) => child !== node);
			node.parentNode = null;
			return node;
		},
	};

	for (const child of childNodes) parent.insertBefore(child, null);
	return parent;
}

function childNames(parent: FakeRangeParent): string[] {
	return parent.childNodes.map((child) => child.name);
}

test('runtime DOM journal applier mutates concrete text attribute and property targets in order', () => {
	const countText = { textContent: '' };
	const button = element();
	const targets = new Map<string, unknown>([
		['text:count', countText],
		['button:count', button],
	]);

	applyDomJournalEntries(
		[
			{ type: 'setText', locator: 'text:count', value: 1 },
			{
				type: 'setAttr',
				locator: 'button:count',
				name: 'data-count',
				value: 1,
			},
			{
				type: 'setProp',
				locator: 'button:count',
				name: 'disabled',
				value: true,
			},
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(countText.textContent).toBe('1');
	expect(button.attributes.get('data-count')).toBe('1');
	expect(button.disabled).toBe(true);
});

test('runtime DOM journal applier removes nullish and false attributes', () => {
	const button = element();
	button.attributes.set('hidden', '');
	button.attributes.set('aria-busy', 'true');
	const targets = new Map<string, unknown>([['button:count', button]]);

	applyDomJournalEntries(
		[
			{ type: 'setAttr', locator: 'button:count', name: 'hidden', value: false },
			{ type: 'setAttr', locator: 'button:count', name: 'aria-busy', value: null },
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(button.attributes.has('hidden')).toBe(false);
	expect(button.attributes.has('aria-busy')).toBe(false);
});

test('runtime DOM journal applier runs cleanup entries in journal order', () => {
	const statusText = { textContent: '' };
	const cleanups: string[] = [];
	const steps: string[] = [];
	const targets = new Map<string, unknown>([['text:status', statusText]]);

	applyDomJournalEntries(
		[
			{ type: 'setText', locator: 'text:status', value: 'pending' },
			{ type: 'runCleanup', locator: 'behavior:menu' },
			{ type: 'setText', locator: 'text:status', value: 'done' },
		],
		{
			resolveTarget(locator) {
				steps.push(`resolve:${locator}`);
				return targets.get(locator);
			},
			runCleanup(cleanupId) {
				steps.push(`cleanup:${cleanupId}`);
				cleanups.push(cleanupId);
			},
		},
	);

	expect(statusText.textContent).toBe('done');
	expect(cleanups).toEqual(['behavior:menu']);
	expect(steps).toEqual(['resolve:text:status', 'cleanup:behavior:menu', 'resolve:text:status']);
});

test('runtime DOM journal applier routes range entries through host callbacks in journal order', () => {
	const steps: string[] = [];

	applyDomJournalEntries(
		[
			{ type: 'insertRange', locator: 'anchor:items', fragment: ['first', 'second'] },
			{ type: 'moveRange', locator: 'range:first', before: 'anchor:end' },
			{ type: 'removeRange', locator: 'range:second' },
		],
		{
			resolveTarget(locator) {
				steps.push(`resolve:${locator}`);
				return undefined;
			},
			insertRange(locator, fragment) {
				steps.push(`insert:${locator}:${(fragment as string[]).join(',')}`);
			},
			moveRange(locator, before) {
				steps.push(`move:${locator}->${before}`);
			},
			removeRange(locator) {
				steps.push(`remove:${locator}`);
			},
		},
	);

	expect(steps).toEqual([
		'insert:anchor:items:first,second',
		'move:range:first->anchor:end',
		'remove:range:second',
	]);
});

test('runtime DOM journal applier replaces async boundary ranges with concrete DOM operations', () => {
	const start = rangeNode('start');
	const pending = rangeNode('pending');
	const end = rangeNode('end');
	const next = rangeNode('next');
	const fulfilled = rangeNode('fulfilled');
	const root = rangeParent([start, pending, end, next]);
	const targets = new Map<string, unknown>([
		['async-boundary:profile:start', start],
		['async-boundary:profile:end', end],
	]);

	applyDomJournalEntries(
		[
			{ type: 'removeRange', locator: 'async-boundary:profile' },
			{ type: 'insertRange', locator: 'async-boundary:profile:start', fragment: [fulfilled] },
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(childNames(root)).toEqual(['start', 'fulfilled', 'end', 'next']);
	expect(pending.parentNode).toBe(null);
	expect(fulfilled.parentNode).toBe(root);
});

test('runtime DOM journal applier renders rejected async boundary snapshots before insertion', () => {
	const start = rangeNode('start');
	const pending = rangeNode('pending');
	const end = rangeNode('end');
	const next = rangeNode('next');
	const rejected = rangeNode('rejected');
	const root = rangeParent([start, pending, end, next]);
	const targets = new Map<string, unknown>([
		['async-boundary:profile:start', start],
		['async-boundary:profile:end', end],
	]);
	const renderedSnapshots: unknown[] = [];

	applyDomJournalEntries(
		[
			{ type: 'removeRange', locator: 'async-boundary:profile' },
			{
				type: 'insertRange',
				locator: 'async-boundary:profile:start',
				fragment: {
					type: 'async-boundary-snapshot',
					boundaryId: 'profile',
					graphNodeId: 'computed:profile',
					path: ['name'],
					snapshot: {
						status: 'rejected',
						version: 2,
						key: 'ada',
						error: new Error('profile failed'),
					},
				},
			},
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
			renderAsyncSnapshot(fragment) {
				renderedSnapshots.push(fragment);
				return [rejected];
			},
		},
	);

	expect(renderedSnapshots).toEqual([
		expect.objectContaining({
			boundaryId: 'profile',
			graphNodeId: 'computed:profile',
			path: ['name'],
			snapshot: expect.objectContaining({
				status: 'rejected',
				error: expect.any(Error),
			}),
		}),
	]);
	expect(childNames(root)).toEqual(['start', 'rejected', 'end', 'next']);
	expect(pending.parentNode).toBe(null);
	expect(rejected.parentNode).toBe(root);
});

test('runtime DOM journal applier moves retained-anchor range contents before a target anchor', () => {
	const firstStart = rangeNode('first-start');
	const firstContent = rangeNode('first-content');
	const firstEnd = rangeNode('first-end');
	const secondStart = rangeNode('second-start');
	const secondContent = rangeNode('second-content');
	const secondEnd = rangeNode('second-end');
	const root = rangeParent([
		firstStart,
		firstContent,
		firstEnd,
		secondStart,
		secondContent,
		secondEnd,
	]);
	const targets = new Map<string, unknown>([
		['item:first:start', firstStart],
		['item:second:start', secondStart],
		['item:second:end', secondEnd],
	]);

	applyDomJournalEntries(
		[{ type: 'moveRange', locator: 'item:second', before: 'item:first:start' }],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(childNames(root)).toEqual([
		'second-content',
		'first-start',
		'first-content',
		'first-end',
		'second-start',
		'second-end',
	]);
	expect(secondContent.parentNode).toBe(root);
});

test('createDomUpdateEntry maps DOM update targets to concrete DOM operations', () => {
	expect(
		createDomUpdateEntry({
			locator: 'text:count',
			target: { kind: 'text' },
			value: 7,
		}),
	).toEqual({ type: 'setText', locator: 'text:count', value: 7 });

	expect(
		createDomUpdateEntry({
			locator: 'button:title',
			target: { kind: 'attribute', name: 'title' },
			value: 'Open',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:title', name: 'title', value: 'Open' });

	expect(
		createDomUpdateEntry({
			locator: 'input:value',
			target: { kind: 'property', name: 'value' },
			value: 'Menu',
		}),
	).toEqual({ type: 'setProp', locator: 'input:value', name: 'value', value: 'Menu' });

	expect(
		createDomUpdateEntry({
			locator: 'button:class',
			target: { kind: 'class' },
			value: 'is-active',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:class', name: 'class', value: 'is-active' });

	expect(
		createDomUpdateEntry({
			locator: 'button:style',
			target: { kind: 'style' },
			value: 'color: red;',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:style', name: 'style', value: 'color: red;' });
});
