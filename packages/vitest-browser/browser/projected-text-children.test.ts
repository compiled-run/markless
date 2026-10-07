import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ProjectedTextChildren from './fixtures/projected-text-children.tsrx';
import ProjectedTextImported from './fixtures/projected-text-imported.tsrx';
import ProjectedTextSeed from './fixtures/projected-text-seed-page.tsrx';

// A reactive text expression passed straight in as a component's children must update
// like the same expression wrapped in an element.
afterEach(() => cleanup());

function texts(container: ParentNode, selector: string): string[] {
	return [...container.querySelectorAll(selector)].map((node) => node.textContent ?? '');
}

function click(container: ParentNode, selector: string): void {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectProjectedTextUpdates(container: ParentNode) {
	expect(texts(container, '[data-live]')).toEqual(['none', 'none']);
	expect(texts(container, '[data-frame]')).toEqual(['0 cups', 'calm & <still>']);
	expect(texts(container, '[data-chip]')).toEqual(['!']);
	expect(texts(container, '[data-note]')).toEqual(['note: 0 of calm & <still>']);

	click(container, '[data-more]');
	await expect.poll(() => texts(container, '[data-live]')).toEqual(['some', 'some']);
	await expect.poll(() => texts(container, '[data-frame]')).toEqual(['1 cups', 'calm & <still>']);
	await expect.poll(() => texts(container, '[data-note]')).toEqual(['note: 1 of calm & <still>']);

	click(container, '[data-more]');
	await expect.poll(() => texts(container, '[data-frame]')).toEqual(['2 cups', 'calm & <still>']);

	// The handler reads the cell back, so a cell overwritten with escaped markup would show here.
	click(container, '[data-mode]');
	await expect.poll(() => texts(container, '[data-frame]')).toEqual(['2 cups', 'calm & <still>!']);
	await expect.poll(() => texts(container, '[data-note]')).toEqual(['note: 2 of calm & <still>!']);
	expect(texts(container, '[data-live]')).toEqual(['some', 'some']);

	click(container, '[data-tag]');
	await expect.poll(() => texts(container, '[data-chip]')).toEqual(['mk-2!']);
	expect(container.querySelector('[data-chip] i')?.textContent).toBe('!');
}

test('CSR: reactive text passed as children updates', async () => {
	const screen = await render(ProjectedTextChildren);
	await expectProjectedTextUpdates(screen.container as HTMLElement);
});

test('SSR resume: reactive text passed as children updates', async () => {
	const screen = await renderSSR(ProjectedTextChildren);
	await expectProjectedTextUpdates(screen.container);
});

// One component whose children-text edges all reach imported parts.
async function expectImportedTextUpdates(container: ParentNode) {
	expect(texts(container, '[data-chip]')).toEqual(['!']);
	expect(texts(container, '[data-note]')).toEqual(['note: 3 hits']);

	expect(texts(container, '[data-shout]')).toEqual(['quiet', 'quiet']);

	click(container, '[data-set]');
	await expect.poll(() => texts(container, '[data-echo]')).toEqual(['mk-3']);
	// A value that spells markup arrives as text, never as elements.
	await expect.poll(() => texts(container, '[data-shout]')).toEqual(['mk-3', '<b>mk-3</b>']);
	expect(container.querySelector('[data-shout] b')).toBeNull();
	await expect.poll(() => texts(container, '[data-chip]')).toEqual(['mk-3!']);
	await expect.poll(() => texts(container, '[data-note]')).toEqual(['note: 4 hits']);

	click(container, '[data-set]');
	await expect.poll(() => texts(container, '[data-chip]')).toEqual(['mk-4!']);
	await expect.poll(() => texts(container, '[data-note]')).toEqual(['note: 5 hits']);
}

test('CSR: reactive text passed as children of imported parts updates', async () => {
	const screen = await render(ProjectedTextImported);
	await expectImportedTextUpdates(screen.container as HTMLElement);
});

test('SSR resume: reactive text passed as children of imported parts updates', async () => {
	const screen = await renderSSR(ProjectedTextImported);
	await expectImportedTextUpdates(screen.container);
});

// Only the part whose body seeds the shared cell feeds it; a sibling part taking live
// text of its own must not overwrite the cell with that text.
async function expectSeedFollowsItsOwnPart(container: ParentNode) {
	const own = () => container.querySelector('[data-meter]')?.getAttribute('ui-own');
	expect(texts(container, '[data-caption]')).toEqual(['2 high']);
	expect(own()).toBe('steady');

	click(container, '[data-raise]');
	await expect.poll(() => texts(container, '[data-caption]')).toEqual(['3 high']);
	click(container, '[data-raise]');
	await expect.poll(() => texts(container, '[data-caption]')).toEqual(['4 high']);
	expect(own()).toBe('steady');
	expect(texts(container, '[data-readout]')).toEqual(['steady']);
}

test('CSR: a shared cell seeded from children follows only its own part', async () => {
	const screen = await render(ProjectedTextSeed);
	await expectSeedFollowsItsOwnPart(screen.container as HTMLElement);
});

test('SSR resume: a shared cell seeded from children follows only its own part', async () => {
	const screen = await renderSSR(ProjectedTextSeed);
	await expectSeedFollowsItsOwnPart(screen.container);
});
