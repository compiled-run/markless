import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { HiddenComputedPage } from './hidden-computed-page.tsrx';
import { readSceneRuns } from './scene-lib.ts';

// Spec 03: a sync computed re-derives when read. One that only a hidden
// branch reads must not run while that branch stays hidden.

afterEach(cleanup);

async function lazyCycle(container: HTMLElement) {
	const click = (selector: string) => container.querySelector<HTMLElement>(selector)!.click();
	const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
	expect(container.querySelector('[data-scene]')).toBeNull();
	const runsAtStart = readSceneRuns();

	click('[data-seed]');
	click('[data-seed]');
	await expect.poll(() => text('[data-seed-value]')).toBe('5');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(readSceneRuns()).toBe(runsAtStart);

	click('[data-toggle]');
	await expect.poll(() => text('[data-scene]')).toBe('scene-35');
	expect(readSceneRuns()).toBe(runsAtStart + 1);

	click('[data-seed]');
	await expect.poll(() => text('[data-scene]')).toBe('scene-42');

	click('[data-toggle]');
	await expect.poll(() => container.querySelector('[data-scene]')).toBeNull();
	const runsWhenHidden = readSceneRuns();
	click('[data-seed]');
	await expect.poll(() => text('[data-seed-value]')).toBe('7');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(readSceneRuns()).toBe(runsWhenHidden);

	click('[data-toggle]');
	await expect.poll(() => text('[data-scene]')).toBe('scene-49');
}

test('SSR: a computed only a hidden branch reads does not re-derive while hidden', async () => {
	const screen = await renderSSR(HiddenComputedPage);
	await lazyCycle(screen.container as HTMLElement);
});

test('CSR: a computed only a hidden branch reads does not re-derive while hidden', async () => {
	const screen = await render(HiddenComputedPage);
	await lazyCycle(screen.container as HTMLElement);
});
