import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderStreamShell } from '../src/index.ts';
import Harbor from './fixtures/client-settled-arm.tsrx';
import DockPage from './fixtures/client-settled-dock-page.tsrx';
import Marina from './fixtures/client-settled-rows.tsrx';

// An arm the client settles comes back live: its handler fires and its own text follows, every settle.
afterEach(() => cleanup());

async function expectArmLive(container: HTMLElement, title: string, cheers: number) {
	const armCheers = () => container.querySelector('[data-arm-cheers]')?.textContent;
	await expect.poll(() => container.querySelector('[data-cheer]')?.textContent).toBe(title);
	container.querySelector<HTMLButtonElement>('[data-cheer]')?.click();
	await expect
		.poll(() => container.querySelector('[data-outside]')?.textContent)
		.toBe(String(cheers));
	await expect.poll(armCheers).toBe(String(cheers));
}

test('a pending shell the client settles comes back interactive', async () => {
	const shell = await renderStreamShell(Harbor);
	expect(shell).toContain('Checking tides');
	const { container } = renderServerHTML(shell);
	await expectArmLive(container, 'Harbor low', 1);
});

test('a re-settle after a dependency change stays interactive', async () => {
	const shell = await renderStreamShell(Harbor);
	const { container } = renderServerHTML(shell);
	await expectArmLive(container, 'Harbor low', 1);
	container.querySelector<HTMLButtonElement>('[data-tide]')?.click();
	await expectArmLive(container, 'Harbor high', 2);
});

test('CSR render of a root @try arm settles interactive, and again after a re-settle', async () => {
	const screen = await render(Harbor);
	const container = screen.container as HTMLElement;
	await expectArmLive(container, 'Harbor low', 1);
	container.querySelector<HTMLButtonElement>('[data-tide]')?.click();
	await expectArmLive(container, 'Harbor high', 2);
});

async function expectDockLive(container: HTMLElement, name: string, moored: number) {
	await expect.poll(() => container.querySelector('[data-moor]')?.textContent).toBe(name);
	container.querySelector<HTMLButtonElement>('[data-moor]')?.click();
	await expect
		.poll(() => container.querySelector('[data-moored]')?.textContent)
		.toBe(String(moored));
}

test('a @try inside a composed component settles and re-settles interactive (stream shell)', async () => {
	const shell = await renderStreamShell(DockPage);
	const { container } = renderServerHTML(shell);
	await expectDockLive(container, 'Dock north', 1);
	container.querySelector<HTMLButtonElement>('[data-berth]')?.click();
	await expectDockLive(container, 'Dock south', 2);
});

test('a @try inside a composed component settles and re-settles interactive (CSR)', async () => {
	const screen = await render(DockPage);
	const container = screen.container as HTMLElement;
	await expectDockLive(container, 'Dock north', 1);
	container.querySelector<HTMLButtonElement>('[data-berth]')?.click();
	await expectDockLive(container, 'Dock south', 2);
});

async function expectRowsArmLive(
	container: HTMLElement,
	name: string,
	boats: number,
	hails: number,
) {
	await expect.poll(() => container.querySelector('[data-hail]')?.textContent).toBe(name);
	expect(container.querySelectorAll('ol > li')).toHaveLength(boats);
	container.querySelector<HTMLButtonElement>('[data-hail]')?.click();
	await expect
		.poll(() => container.querySelector('[data-hails]')?.textContent)
		.toBe(String(hails));
}

test('an arm whose rows render before its button locates the button after every settle', async () => {
	const shell = await renderStreamShell(Marina);
	const { container } = renderServerHTML(shell);
	await expectRowsArmLive(container, 'Marina 2', 2, 1);
	container.querySelector<HTMLButtonElement>('[data-grow]')?.click();
	await expectRowsArmLive(container, 'Marina 3', 3, 2);
});

test('CSR: an arm whose rows render before its button locates the button after every settle', async () => {
	const screen = await render(Marina);
	const container = screen.container as HTMLElement;
	await expectRowsArmLive(container, 'Marina 2', 2, 1);
	container.querySelector<HTMLButtonElement>('[data-grow]')?.click();
	await expectRowsArmLive(container, 'Marina 3', 3, 2);
});
