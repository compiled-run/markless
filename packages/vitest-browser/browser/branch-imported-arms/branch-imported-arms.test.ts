import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { BranchImportedIfPage } from './if-page.tsrx';
import { BranchImportedArmsPage } from './page.tsrx';

// Components imported from another file, with state of their own or a value
// derived from a changing prop, inside @switch/@if: the branch renders them
// when it first shows and their state lives and dies with the branch.

afterEach(cleanup);

function at(container: HTMLElement) {
	const click = (selector: string) => {
		const element = container.querySelector<HTMLElement>(selector);
		if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
		element.click();
	};
	const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
	return { click, text };
}

async function switchCycle(container: HTMLElement) {
	const { click, text } = at(container);
	expect(text('[data-empty]')).toBe('nothing shown');

	click('[data-relabel]');
	click('[data-seed]');
	await expect.poll(() => text('[data-empty]')).toBe('nothing shown');

	click('[data-show-counter]');
	await expect.poll(() => text('[data-label]')).toBe('tag!');
	expect(text('[data-inc]')).toBe('0');
	click('[data-inc]');
	await expect.poll(() => text('[data-inc]')).toBe('1');
	click('[data-relabel]');
	await expect.poll(() => text('[data-label]')).toBe('tag!!');
	expect(container.querySelector('[data-label]')?.getAttribute('title')).toBe('tag!!');
	expect(text('[data-inc]')).toBe('1');
	click('[data-bump]');
	await expect.poll(() => text('[data-bumps]')).toBe('1');

	click('[data-show-scene]');
	await expect.poll(() => text('[data-scene]')).toBe('scene-28');
	expect(container.querySelector('[data-counter]')).toBeNull();
	click('[data-seed]');
	await expect.poll(() => text('[data-scene]')).toBe('scene-35');

	// Showing the counter again starts a fresh instance.
	click('[data-show-counter]');
	await expect.poll(() => text('[data-label]')).toBe('tag!!');
	expect(text('[data-inc]')).toBe('0');
	click('[data-inc]');
	await expect.poll(() => text('[data-inc]')).toBe('1');

	click('[data-show-none]');
	await expect.poll(() => text('[data-empty]')).toBe('nothing shown');
	expect(container.querySelector('[data-counter]')).toBeNull();
}

test('SSR: imported stateful and prop-derived components render when their @switch case first shows', async () => {
	const screen = await renderSSR(BranchImportedArmsPage);
	await switchCycle(screen.container as HTMLElement);
});

test('CSR: imported stateful and prop-derived components render when their @switch case first shows', async () => {
	const screen = await render(BranchImportedArmsPage);
	await switchCycle(screen.container as HTMLElement);
});

async function ifCycle(container: HTMLElement) {
	const { click, text } = at(container);
	expect(text('[data-label]')).toBe('note');
	click('[data-inc]');
	await expect.poll(() => text('[data-inc]')).toBe('1');
	click('[data-relabel]');
	await expect.poll(() => text('[data-label]')).toBe('note?');

	click('[data-toggle]');
	await expect.poll(() => container.querySelector('[data-counter]')).toBeNull();
	click('[data-relabel]');

	click('[data-toggle]');
	await expect.poll(() => text('[data-label]')).toBe('note??');
	expect(text('[data-inc]')).toBe('0');
	click('[data-inc]');
	await expect.poll(() => text('[data-inc]')).toBe('1');
	click('[data-relabel]');
	await expect.poll(() => text('[data-label]')).toBe('note???');
	expect(container.querySelector('[data-label]')?.getAttribute('title')).toBe('note???');
	click('[data-bump]');
	await expect.poll(() => text('[data-bumps]')).toBe('1');
}

test('SSR: an imported stateful component the server showed in an @if resumes, closes, and reopens fresh', async () => {
	const screen = await renderSSR(BranchImportedIfPage);
	await ifCycle(screen.container as HTMLElement);
});

test('CSR: an imported stateful component in an open @if closes and reopens fresh', async () => {
	const screen = await render(BranchImportedIfPage);
	await ifCycle(screen.container as HTMLElement);
});
