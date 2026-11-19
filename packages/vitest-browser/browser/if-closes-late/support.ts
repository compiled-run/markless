import { expect } from 'vitest';
import { answerGroceries, groceriesAsked } from './groceries.ts';

const LOADS = { timeout: 10_000 };
const rows = () => [...document.querySelectorAll('[data-row]')].map((row) => row.textContent?.trim());
const read = () => `${document.querySelector('[data-loading]') ? 'Loading' : '-'} | ${rows().join(', ')}`;

// Each state that outlives the microtasks queued behind it, so the browser could paint it at the next task.
// Rechecking from a microtask keeps the queue busy: the page's own microtasks still run between checks, its tasks never do.
function statesBetweenTasks(): () => string[] {
	const seen = [read()];
	let checking = false;
	const settle = (hops: number) => {
		if (hops < 10_000) return queueMicrotask(() => settle(hops + 1));
		checking = false;
		if (seen.at(-1) !== read()) seen.push(read());
	};
	const observer = new MutationObserver(() => {
		if (checking) return;
		checking = true;
		settle(0);
	});
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
	return () => {
		observer.disconnect();
		return seen;
	};
}

export async function answerClosesLoadingAsRowsFill(): Promise<void> {
	const states = statesBetweenTasks();
	(document.querySelector('[data-load]') as HTMLElement).click();
	await expect.poll(groceriesAsked, LOADS).toBe(true);
	answerGroceries([
		{ id: 'a', name: 'apples' },
		{ id: 'b', name: 'bread' },
	]);
	await expect.poll(read, LOADS).toBe('- | apples, bread');
	expect(states()).toEqual(['Loading | ', '- | apples, bread']);
}
