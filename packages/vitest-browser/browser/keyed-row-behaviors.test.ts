import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import {
	resetRowBehaviorCounters,
	rowBehaviorSnapshot,
} from './fixtures/keyed-row-behavior-counters.ts';
import KeyedRowBehaviors from './fixtures/keyed-row-behaviors.tsrx';

afterEach(() => cleanup());

function rowKeys(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll<HTMLTableRowElement>('tr[data-row-key]')).map(
		(row) => row.dataset.rowKey ?? '',
	);
}

function run(container: HTMLElement, operation: string): void {
	const button = container.querySelector<HTMLButtonElement>(
		`button[data-operation="${operation}"]`,
	);
	if (!button) throw new Error(`Expected the ${operation} operation button.`);
	button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

test('CSR keyed rows own distinct attach hosts and exact per-key cleanup lifetimes', async () => {
	resetRowBehaviorCounters();
	const screen = await render(KeyedRowBehaviors);
	const container = screen.container as HTMLElement;

	await expect.poll(() => rowBehaviorSnapshot().attachments).toBe(4);
	const mounted = rowBehaviorSnapshot();
	expect(new Set(mounted.hostsByKey.values()).size).toBe(4);
	expect(rowKeys(container)).toEqual(['a', 'b', 'c', 'd']);

	run(container, 'reuse');
	await expect.poll(() => container.querySelector('td')?.textContent).toBe('Alpha next');
	expect(rowBehaviorSnapshot().attachments).toBe(4);
	expect(rowBehaviorSnapshot().cleanupCounts).toEqual({});
	for (const key of ['a', 'b', 'c', 'd']) {
		expect(rowBehaviorSnapshot().hostsByKey.get(key)).toBe(mounted.hostsByKey.get(key));
	}

	run(container, 'reorder');
	await expect.poll(() => rowKeys(container)).toEqual(['d', 'c', 'b', 'a']);
	expect(rowBehaviorSnapshot().attachments).toBe(4);
	expect(rowBehaviorSnapshot().cleanupCounts).toEqual({});
	for (const key of ['a', 'b', 'c', 'd']) {
		expect(rowBehaviorSnapshot().hostsByKey.get(key)).toBe(mounted.hostsByKey.get(key));
	}

	run(container, 'remove');
	await expect.poll(() => rowKeys(container)).toEqual(['d', 'a']);
	expect(rowBehaviorSnapshot().attachments).toBe(4);
	expect(rowBehaviorSnapshot().cleanupCounts).toEqual({ b: 1, c: 1 });
	expect(rowBehaviorSnapshot().hostsByKey.get('a')).toBe(mounted.hostsByKey.get('a'));
	expect(rowBehaviorSnapshot().hostsByKey.get('d')).toBe(mounted.hostsByKey.get('d'));

	run(container, 'clear');
	await expect.poll(() => rowKeys(container)).toEqual([]);
	expect(rowBehaviorSnapshot().cleanupCounts).toEqual({ a: 1, b: 1, c: 1, d: 1 });

	run(container, 'remount');
	await expect.poll(() => rowBehaviorSnapshot().attachments).toBe(8);
	expect(rowKeys(container)).toEqual(['a', 'b', 'c', 'd']);
	expect(rowBehaviorSnapshot().cleanupCounts).toEqual({ a: 1, b: 1, c: 1, d: 1 });
	for (const key of ['a', 'b', 'c', 'd']) {
		expect(rowBehaviorSnapshot().hostsByKey.get(key)).not.toBe(mounted.hostsByKey.get(key));
	}
});
