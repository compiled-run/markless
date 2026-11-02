import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Direct from './forwarded-constant-props/direct.tsrx';
import Live from './forwarded-constant-props/live.tsrx';
import SameFileChildren from './forwarded-constant-props/same-file-children.tsrx';
import ThreeLevels from './forwarded-constant-props/three-levels.tsrx';
import TwoLevels from './forwarded-constant-props/two-levels.tsrx';

afterEach(() => cleanup());

// The innermost component's computed label and click handler both read a prop the page passes as a constant.
async function forwardedPropReachesReaders(container: HTMLElement, name: string) {
	const button = (to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-pick="${name}-${to}"]`)!;
	for (const to of ['dark', 'light']) expect(button(to).textContent).toBe(`${name} ${to} -> `);
	for (const to of ['dark', 'light']) {
		button(to).click();
		await expect.poll(() => button(to).textContent).toBe(`${name} ${to} -> ${name}:${to}`);
	}
}

test('CSR: a constant prop passed straight to an imported child reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders((await render(Direct)).container as HTMLElement, 'solo');
});
test('SSR resume: a constant prop passed straight to an imported child reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders((await renderSSR(Direct)).container as HTMLElement, 'solo');
});
test('CSR: a constant prop forwarded through two files reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders((await render(TwoLevels)).container as HTMLElement, 'one');
});
test('SSR resume: a constant prop forwarded through two files reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders((await renderSSR(TwoLevels)).container as HTMLElement, 'one');
});
test('CSR: a constant prop forwarded through three files reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders((await render(ThreeLevels)).container as HTMLElement, 'deep');
});
test('SSR resume: a constant prop forwarded through three files reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders(
		(await renderSSR(ThreeLevels)).container as HTMLElement,
		'deep',
	);
});
test('CSR: a constant prop forwarded inside one imported file reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders(
		(await render(SameFileChildren)).container as HTMLElement,
		'local',
	);
});
test('SSR resume: a constant prop forwarded inside one imported file reaches computed and handler readers', async () => {
	await forwardedPropReachesReaders(
		(await renderSSR(SameFileChildren)).container as HTMLElement,
		'local',
	);
});

// A forwarded prop that comes from page state keeps following it.
async function forwardedStateFollowsWrites(container: HTMLElement) {
	const button = (name: string) =>
		container.querySelector<HTMLButtonElement>(`[data-pick="${name}-dark"]`);
	button('one')!.click();
	await expect.poll(() => button('one')?.textContent).toBe('one dark -> one:dark');
	container.querySelector<HTMLButtonElement>('[data-rename]')!.click();
	await expect.poll(() => button('two')?.textContent).toBe('two dark -> one:dark');
	button('two')!.click();
	await expect.poll(() => button('two')?.textContent).toBe('two dark -> two:dark');
}

test('CSR: a state prop forwarded through two files follows the page write', async () => {
	await forwardedStateFollowsWrites((await render(Live)).container as HTMLElement);
});
test('SSR resume: a state prop forwarded through two files follows the page write', async () => {
	await forwardedStateFollowsWrites((await renderSSR(Live)).container as HTMLElement);
});
