import { expect, test, vi } from 'vitest';
import * as busyMarks from '../src/fns/async-plane.ts';

// A comment-anchored range with one row host, marked through plain setAttribute/removeAttribute.
function block() {
	const marked = new Set<string>();
	const host = (name: string) => ({
		nodeType: 1,
		isConnected: true,
		setAttribute: () => marked.add(name),
		removeAttribute: () => marked.delete(name),
	});
	const start = { nodeType: 8 };
	const end = { nodeType: 8 };
	const parent = { nodeType: 1, childNodes: [] as unknown[], ...host('parent') };
	parent.childNodes.push(start, host('row'), end);
	Object.assign(start, { parentNode: parent });
	return { boundary: { startAnchor: start, endAnchor: end } as never, marked };
}

test('a quiet pending refresh over shown content never marks busy', async () => {
	const { boundary, marked } = block();
	busyMarks.note(boundary, 'computed:orders', { status: 'pending', quiet: true }, true);
	await vi.dynamicImportSettled();
	expect([...marked]).toEqual([]);
});

test('a quiet refresh that settles successfully marks nothing either', async () => {
	const { boundary, marked } = block();
	busyMarks.note(boundary, 'computed:orders', { status: 'pending', quiet: true }, true);
	busyMarks.note(boundary, 'computed:orders', { status: 'fulfilled', quiet: true }, true);
	await vi.dynamicImportSettled();
	expect([...marked]).toEqual([]);
});

test('a loud refresh for a different value still marks while a quiet one is in flight', async () => {
	const { boundary, marked } = block();
	busyMarks.note(boundary, 'computed:orders', { status: 'pending', quiet: true }, true);
	busyMarks.note(boundary, 'computed:total', { status: 'pending' }, true);
	await vi.dynamicImportSettled();
	expect([...marked]).toEqual(['parent']);
});
