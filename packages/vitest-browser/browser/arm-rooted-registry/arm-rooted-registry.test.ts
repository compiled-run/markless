import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmRootedPage from './arm-rooted-page.tsrx';

/**
 * A widget family whose cells the compiler designated ONE component to root,
 * rendered twice on one page: once by that component, and once by a second
 * root-shaped component of the same family which carries the cells without
 * designating them.
 *
 * The carrier is still a root - it stands at a proper prefix of the parts
 * projected into it - so its instance owns its own roster and its own shared
 * cells. Rooted nowhere it read the page-wide ids instead: its roster counted
 * both instances' members, and its own `code` answered undefined.
 */
afterEach(async () => {
	await cleanup();
});

const within = (side: string) => `[data-${side}] `;
const members = (side: string) => [...document.querySelectorAll(`${within(side)}[data-member]`)];
const positions = (side: string) => members(side).map((one) => one.getAttribute('ui-pos'));
const chars = (side: string) => members(side).map((one) => one.getAttribute('ui-mine'));
const max = (testid: string) =>
	document.querySelector(`[data-testid="${testid}"]`)?.getAttribute('ui-max');
const extras = () => document.querySelectorAll('[data-extra]').length;
const click = (testid: string) =>
	userEvent.click(document.querySelector(`[data-testid="${testid}"]`) as HTMLElement);

for (const mode of ['CSR', 'SSR'] as const) {
	const mount = async () => {
		if (mode === 'CSR') await render(ArmRootedPage);
		else await renderSSR(ArmRootedPage);
	};

	test(`${mode}: the arm's flip recounts its own instance and leaves the other alone`, async () => {
		await mount();

		await click('toggle');
		await expect.poll(extras, { timeout: 5000 }).toBe(1);

		await expect.poll(() => max('armed-root'), { timeout: 5000 }).toBe('4');
		expect(max('plain-root')).toBe('2');

		await click('toggle');
		await expect.poll(extras, { timeout: 5000 }).toBe(0);

		await expect.poll(() => max('armed-root'), { timeout: 5000 }).toBe('3');
		expect(max('plain-root')).toBe('2');
	});

	test(`${mode}: each instance counts its own roster at first paint`, async () => {
		await mount();

		await expect.poll(() => max('armed-root'), { timeout: 2000 }).toBe('3');
		expect(max('plain-root')).toBe('2');
	});

	test(`${mode}: the arm renumbers only the members of the instance holding it`, async () => {
		await mount();

		expect(positions('first')).toEqual(['0', '1', '2']);
		expect(positions('second')).toEqual(['0', '1']);

		await click('toggle');
		await expect.poll(extras, { timeout: 5000 }).toBe(1);

		await expect.poll(() => positions('first'), { timeout: 5000 }).toEqual(['1', '2', '3']);
		expect(positions('second')).toEqual(['0', '1']);
	});

	test(`${mode}: a shared-cell read after the arm flips answers for its own instance`, async () => {
		await mount();

		expect(chars('first')).toEqual(['a', 'b', 'c']);
		expect(chars('second')).toEqual(['a', 'b']);

		await click('toggle');
		await expect.poll(() => chars('first'), { timeout: 5000 }).toEqual(['b', 'c', 'd']);
		expect(chars('second')).toEqual(['a', 'b']);

		await click('armed-shout');
		await expect.poll(() => chars('first'), { timeout: 5000 }).toEqual(['B', 'C', 'D']);
		expect(chars('second')).toEqual(['a', 'b']);
	});

	test(`${mode}: the designated root's own write reaches neither the arm's instance`, async () => {
		await mount();

		await click('plain-shout');
		await expect.poll(() => chars('second'), { timeout: 5000 }).toEqual(['A', 'B']);
		expect(chars('first')).toEqual(['a', 'b', 'c']);
	});
}
