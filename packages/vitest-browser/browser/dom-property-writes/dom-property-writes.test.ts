import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import ArmMixedPage from './arm-mixed-page.tsrx';
import MediaPage from './media-page.tsrx';
import MixedPage from './mixed-page.tsrx';
import ServedMixedPage from './served-mixed-page.tsrx';

// A member with no live attribute is written as a property on every change.
afterEach(() => cleanup());

const box = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLInputElement>(selector)!;
const states = (container: HTMLElement) =>
	[box(container, '#all'), ...container.querySelectorAll<HTMLInputElement>('.one')].map(
		(input) => (input.indeterminate ? 'mixed' : input.checked ? 'on' : 'off'),
	);
const allFiles = () => page.getByRole('checkbox', { name: 'All files' });

async function checkMixed(container: HTMLElement) {
	expect(states(container)).toEqual(['off', 'off', 'off', 'off']);
	box(container, '[data-id="a"]').click();
	await expect.poll(() => states(container)).toEqual(['mixed', 'on', 'off', 'off']);
	expect(box(container, '#all').hasAttribute('indeterminate')).toBe(false);
	await expect.element(allFiles()).toBePartiallyChecked();
	box(container, '#all').click();
	await expect.poll(() => states(container)).toEqual(['on', 'on', 'on', 'on']);
	await expect.element(allFiles()).toBeChecked();
	box(container, '[data-id="c"]').click();
	box(container, '#partly').click();
	await expect.poll(() => states(container)).toEqual(['mixed', 'on', 'on', 'mixed']);
	await expect.element(allFiles()).toBePartiallyChecked();
}

test('SSR: a mixed checkbox and a mixed row follow state after resume, and read as partially checked', async () => {
	await checkMixed((await renderSSR(MixedPage)).container as HTMLElement);
});

test('CSR: a mixed checkbox and a mixed row follow state, and read as partially checked', async () => {
	await checkMixed((await render(MixedPage)).container as HTMLElement);
});

async function checkServedMixed(container: HTMLElement) {
	const mixed = (selector: string) => box(container, selector).indeterminate;
	expect([
		mixed('#all'),
		mixed('#fixed'),
		mixed('[data-id="docs"]'),
		mixed('[data-id="pics"]'),
	]).toEqual([true, true, true, false]);
	expect(container.querySelector<HTMLAudioElement>('#sound')!.volume).toBe(0.5);
	expect(container.innerHTML).not.toMatch(/<[^>]*\s(?:indeterminate|volume)[\s=>]/i);
	await expect.element(allFiles()).toBePartiallyChecked();
	await expect
		.element(page.getByRole('checkbox', { name: 'Always mixed' }))
		.toBePartiallyChecked();
	await expect.element(page.getByRole('checkbox', { name: 'docs' })).toBePartiallyChecked();
	box(container, '#all').click();
	await expect.poll(() => mixed('#all')).toBe(false);
}

test('SSR: checkboxes mixed from state, a constant and a row read as partially checked at load', async () => {
	await checkServedMixed((await renderSSR(ServedMixedPage)).container as HTMLElement);
});

test('CSR: checkboxes mixed from state, a constant and a row read as partially checked at first render', async () => {
	await checkServedMixed((await render(ServedMixedPage)).container as HTMLElement);
});

async function checkMedia(container: HTMLElement) {
	const clip = container.querySelector<HTMLVideoElement>('#clip')!;
	const pane = container.querySelector<HTMLElement>('#pane')!;
	const draft = box(container, '#draft');
	const read = () => [
		clip.muted,
		clip.volume,
		pane.scrollTop,
		draft.defaultValue,
		draft.getAttribute('value'),
	];
	const attributes = () => [clip.getAttribute('volume'), pane.getAttribute('scrolltop')];
	const served = attributes();
	expect(read()).toEqual([true, 1, 0, 'first', 'first']);
	box(container, '#next').click();
	await expect.poll(read).toEqual([false, 0.25, 120, 'second', 'second']);
	expect(attributes()).toEqual(served);
	expect(draft.hasAttribute('defaultvalue')).toBe(false);
	box(container, '#next').click();
	await expect.poll(read).toEqual([true, 1, 0, 'first', 'first']);
}

test('SSR: muted, volume, scrollTop and defaultValue follow state after resume', async () => {
	await checkMedia((await renderSSR(MediaPage)).container as HTMLElement);
});

test('CSR: muted, volume, scrollTop and defaultValue follow state', async () => {
	await checkMedia((await render(MediaPage)).container as HTMLElement);
});

async function checkBuiltInBrowser(container: HTMLElement) {
	box(container, '#open').click();
	box(container, '#add').click();
	await expect
		.poll(
			() =>
				container.querySelector('#inner') !== null &&
				container.querySelector('[data-id="pics"]') !== null,
		)
		.toBe(true);
	const mixed = () =>
		[...container.querySelectorAll<HTMLInputElement>('input')].map(
			(input) =>
				`${input.id || `${input.className}:${input.dataset.id}`}=${input.indeterminate}`,
		);
	await expect
		.poll(mixed)
		.toEqual([
			'inner=true',
			'inner-fixed=true',
			'folder:docs=false',
			'fixed:docs=true',
			'folder:pics=true',
			'fixed:pics=true',
		]);
	await expect
		.element(page.getByRole('checkbox', { name: 'Inner', exact: true }))
		.toBePartiallyChecked();
}

test('SSR: an @if arm and a row the browser builds after resume carry their mixed state', async () => {
	await checkBuiltInBrowser((await renderSSR(ArmMixedPage)).container as HTMLElement);
});

test('CSR: an @if arm and a row the browser builds after the first render carry their mixed state', async () => {
	await checkBuiltInBrowser((await render(ArmMixedPage)).container as HTMLElement);
});
