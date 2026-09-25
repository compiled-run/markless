import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-outer-read/ror-page.tsrx';

afterEach(() => cleanup());

// Row markup reading state declared outside the @for stays current after that state is written.
function snapshot(container: ParentNode) {
	return [...container.querySelectorAll('[data-row]')].map((li) => {
		const classes = li.className.split(' ').filter((name) => name === 'on' || name === 'off');
		const em = li.querySelector('[data-double]');
		return `${li.getAttribute('data-row')}:${classes.join()}:${li.querySelector('[data-mark]')?.textContent}:${em?.getAttribute('title')}:${em?.textContent}`;
	});
}

function scoped(container: ParentNode) {
	const outside = container.querySelector('[data-outside]')!;
	const scope = [...outside.classList].find((name) => name !== 'on' && name !== 'off');
	return [...container.querySelectorAll('[data-row]')].every((li) => scope && li.classList.contains(scope));
}

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLButtonElement>(selector)?.click();
}

async function rowHandlerWritesOuterState(container: HTMLElement) {
	expect(snapshot(container)).toEqual(['1:off:no:once:0', '2:off:no:once:0', '3:off:no:once:0']);
	click(container, '[data-pick="2"]');
	await expect.poll(() => container.querySelector('[data-selected]')?.textContent).toBe('2');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['1:off:no:once:4', '2:on:yes:twice:4', '3:off:no:once:4']);
	click(container, '[data-pick="1"]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['1:on:yes:twice:2', '2:off:no:once:2', '3:off:no:once:2']);
	expect(scoped(container)).toBe(true);
}

async function outerHandlerWritesOuterState(container: HTMLElement) {
	click(container, '[data-outer-pick]');
	await expect.poll(() => container.querySelector('[data-selected]')?.textContent).toBe('3');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['1:off:no:once:6', '2:off:no:once:6', '3:on:yes:twice:6']);
	expect(scoped(container)).toBe(true);
}

async function mintedRowFollowsOuterState(container: HTMLElement) {
	click(container, '[data-add]');
	await expect.poll(() => container.querySelectorAll('[data-row]').length).toBe(4);
	click(container, '[data-pick="4"]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['1:off:no:once:8', '2:off:no:once:8', '3:off:no:once:8', '4:on:yes:twice:8']);
	click(container, '[data-outer-pick]');
	await expect
		.poll(() => snapshot(container))
		.toEqual(['1:off:no:once:6', '2:off:no:once:6', '3:on:yes:twice:6', '4:off:no:once:6']);
	expect(scoped(container)).toBe(true);
}

test('CSR: a row handler writing outer state updates row bindings', async () => {
	const screen = await render(Page);
	await rowHandlerWritesOuterState(screen.container as HTMLElement);
});

test('CSR: an outer handler writing outer state updates row bindings', async () => {
	const screen = await render(Page);
	await outerHandlerWritesOuterState(screen.container as HTMLElement);
});

test('CSR: a row minted after load follows outer state', async () => {
	const screen = await render(Page);
	await mintedRowFollowsOuterState(screen.container as HTMLElement);
});

test('SSR resume: a row handler writing outer state updates row bindings', async () => {
	const screen = await renderSSR(Page);
	await rowHandlerWritesOuterState(screen.container as HTMLElement);
});

test('SSR resume: an outer handler writing outer state updates row bindings', async () => {
	const screen = await renderSSR(Page);
	await outerHandlerWritesOuterState(screen.container as HTMLElement);
});

test('SSR resume: a row minted after resume follows outer state', async () => {
	const screen = await renderSSR(Page);
	await mintedRowFollowsOuterState(screen.container as HTMLElement);
});
