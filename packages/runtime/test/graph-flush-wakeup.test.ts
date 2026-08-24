import { expect, test, vi } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Every unrequested flush pass is preceded by exactly one scheduleFlush, which
// schedules exactly one microtask, so counting these counts flush passes.
const countScheduledFlushes = () => vi.spyOn(globalThis, 'queueMicrotask');

test('a write landing while a flush is active reaches the DOM with no explicit flush()', async () => {
	const dom: unknown[] = [];
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:trail', value: '' }] });

	graph.subscribe({
		id: 'dom-update:trail',
		graphNodeId: 'state:trail',
		run: (value) => ({ type: 'setText', locator: 'text:trail', value }),
	});

	let landed = false;
	graph.subscribeJournal(async (entries) => {
		dom.push(...entries);
		if (landed) return;
		landed = true;
		// The second entry of a handler list writes here: the first entry's flush
		// is past its drain loop (flushing === false) but not yet settled
		// (activeFlush still set) - the window defect 88 stranded writes in.
		graph.write({ graphNodeId: 'state:trail', value: 'first|second' });
	});

	graph.write({ graphNodeId: 'state:trail', value: 'first' });

	await macrotask();
	await macrotask();

	expect(graph.read('state:trail')).toBe('first|second');
	expect(dom).toEqual([
		{ type: 'setText', locator: 'text:trail', value: 'first' },
		{ type: 'setText', locator: 'text:trail', value: 'first|second' },
	]);

	const scheduled = countScheduledFlushes();
	await macrotask();
	await macrotask();
	expect(scheduled).not.toHaveBeenCalled();
	expect(dom).toHaveLength(2);
	scheduled.mockRestore();
});

test('a settled graph schedules no further flush passes', async () => {
	let runs = 0;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:status', value: 'off' }] });

	graph.subscribe({
		id: 'dom-update:status',
		graphNodeId: 'state:status',
		run: (value) => {
			runs++;
			return { type: 'setText', locator: 'text:status', value };
		},
	});

	graph.write({ graphNodeId: 'state:status', value: 'on' });
	await macrotask();
	expect(runs).toBe(1);

	const scheduled = countScheduledFlushes();
	await macrotask();
	await macrotask();
	await macrotask();
	expect(scheduled).not.toHaveBeenCalled();
	expect(runs).toBe(1);
	scheduled.mockRestore();
});
