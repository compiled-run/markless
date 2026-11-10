import { expect, test, vi } from 'vitest';
import * as busyMarks from '../src/fns/async-plane.ts';

// Marks load with the first refresh, and calls made meanwhile run in order once they arrive.
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

test('a refresh that settles before the marks load leaves nothing marked', async () => {
	const { boundary, marked } = block();
	busyMarks.note(boundary, 'computed:tide', { status: 'pending' }, true);
	busyMarks.note(boundary, 'computed:tide', { status: 'fulfilled' }, true);
	busyMarks.set(boundary, false);
	await vi.dynamicImportSettled();
	expect([...marked]).toEqual([]);
});

test('a first load marks nothing; a refresh over shown content marks its block', async () => {
	const { boundary, marked } = block();
	busyMarks.note(boundary, 'computed:tide', { status: 'pending' }, false);
	busyMarks.set(boundary, false);
	expect([...marked]).toEqual([]);
	busyMarks.note(boundary, 'computed:tide', { status: 'pending' }, true);
	await vi.dynamicImportSettled();
	expect([...marked]).toEqual(['parent']);
	busyMarks.note(boundary, 'computed:tide', { status: 'fulfilled' }, true);
	busyMarks.set(boundary, false);
	expect([...marked]).toEqual([]);
});
