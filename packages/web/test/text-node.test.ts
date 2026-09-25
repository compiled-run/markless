import { expect, test } from 'vitest';
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
