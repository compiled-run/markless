import { expect, test } from 'vitest';
import { marklessSiblingText } from '../src/fns/sibling-text.ts';
import { marklessTextNode } from '../src/fns/text-node.ts';

type FakeNode = { nodeType: number; name: string };

function host(...names: string[]) {
	const childNodes: FakeNode[] = names.map((name) => ({
		nodeType: name.startsWith('#') ? 3 : 1,
		name,
	}));
	return {
		childNodes,
		ownerDocument: { createTextNode: (): FakeNode => ({ nodeType: 3, name: '#new' }) },
		insertBefore(node: FakeNode, before: FakeNode | null) {
			const at = before ? childNodes.indexOf(before) : childNodes.length;
			childNodes.splice(at, 0, node);
		},
	};
}

test('a served text node is found at its position from either end', () => {
	const served = host('#text', 'b');
	expect(marklessTextNode(served, 0)).toBe(served.childNodes[0]);
	const trailing = host('i', 'span', '#text', 'b');
	expect(marklessTextNode(trailing, -2)).toBe(trailing.childNodes[2]);
});

test('an empty value served no node, so the first write puts one in its place', () => {
	const leading = host('b');
	marklessTextNode(leading, 0);
	expect(leading.childNodes.map((node) => node.name)).toEqual(['#new', 'b']);

	const trailing = host('i', 'b');
	marklessTextNode(trailing, -2);
	expect(trailing.childNodes.map((node) => node.name)).toEqual(['i', '#new', 'b']);

	const last = host('i');
	marklessTextNode(last, -1);
	expect(last.childNodes.map((node) => node.name)).toEqual(['i', '#new']);
});

function siblings(...names: string[]) {
	const parent = host(...names);
	const at = (name: string) => {
		const node = parent.childNodes.find((child) => child.name === name)!;
		const near = (step: number) => parent.childNodes[parent.childNodes.indexOf(node) + step] ?? null;
		return Object.defineProperties(node, {
			ownerDocument: { value: parent.ownerDocument, configurable: true },
			parentNode: { value: parent, configurable: true },
			previousSibling: { get: () => near(-1), configurable: true },
			nextSibling: { get: () => near(1), configurable: true },
		});
	};
	return { parent, at };
}

test('text projected beside an element is the node just before or after it', () => {
	const { parent, at } = siblings('#before', 'span', '#after');
	expect(marklessSiblingText(at('span'), 'previous')).toBe(parent.childNodes[0]);
	expect(marklessSiblingText(at('span'), 'next')).toBe(parent.childNodes[2]);
});

test('an empty projected value served no node, so the first write puts one beside the element', () => {
	const { parent, at } = siblings('b', 'span', 'i');
	const span = at('span');
	marklessSiblingText(span, 'previous');
	marklessSiblingText(span, 'next');
	expect(parent.childNodes.map((node) => node.name)).toEqual(['b', '#new', 'span', '#new', 'i']);
});
