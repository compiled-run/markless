import { afterEach, beforeEach, expect, test } from 'vitest';
import { __marklessLivePropPathsForTest } from '../../../web/src/fns/instance-scope.ts';
import { cleanup, render } from '../../src/index.ts';
import { resetLogs } from './api.ts';
import RowArmPage from './row-arm-page.tsrx';

// The owner routes an arm's symbols read go with the instance: a row re-keyed many times keeps only its live row's.
beforeEach(resetLogs);
afterEach(cleanup);

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

test('an arm opened and closed in a row whose key changes many times keeps live prop routes for the live row only', async () => {
	const { runtime } = await render(RowArmPage);
	// The graph is built on the first interaction that needs it.
	const paths = () => __marklessLivePropPathsForTest(runtime.graph as never);
	const seen = new Set<string>();
	for (let key = 1; key <= 8; key++) {
		await expect.poll(() => document.querySelector(`[data-row="${key}"] [data-open]`)).not.toBeNull();
		click(`[data-row="${key}"] [data-open]`);
		// A row-placed owner's arm reads `undefined` today (a separate defect); only the settled @try matters here.
		await expect.poll(() => document.querySelector(`[data-row="${key}"] [data-loaded]`)?.textContent).toMatch(/^loaded /);
		for (const path of paths()) seen.add(path);
		expect(paths().length).toBeGreaterThan(0);
		expect(paths().filter((path) => !path.startsWith(`r:${key}:`))).toEqual([]);
		click(`[data-row="${key}"] [data-close]`);
		await expect.poll(() => document.querySelector(`[data-row="${key}"] [data-closed]`)).not.toBeNull();
		click('[data-rekey]');
	}
	expect(seen.size).toBeGreaterThanOrEqual(8);
	expect(paths().length).toBeLessThanOrEqual(2);
});

// Known defect, not the live routes': its file binds the arm's reads only along the chain from the component there that places it, so placed from another file they read `undefined`.
test.fails('an arm opened in a row-placed owner reads the prop it was handed in its async value', async () => {
	await render(RowArmPage);
	click('[data-row="1"] [data-open]');
	await expect.poll(() => document.querySelector('[data-row="1"] [data-loaded]')?.textContent).toMatch(/^loaded /);
	expect(document.querySelector('[data-row="1"] [data-text]')?.textContent).toBe('1');
	expect(document.querySelector('[data-row="1"] [data-loaded]')?.textContent).toBe('loaded 1');
});
