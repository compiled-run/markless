import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ChildPage from './nt-child.tsrx';
import DeepPage from './nt-deep.tsrx';
import InlinePage from './nt-inline.tsrx';

afterEach(() => cleanup());

function text(container: unknown, selector: string): string | null | undefined {
	return (container as HTMLElement).querySelector(selector)?.textContent;
}

function click(container: unknown, selector: string): void {
	const button = (container as HTMLElement).querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	button.click();
}

test('CSR: an inline @try inside a settled @try arm loads its own block', async () => {
	const screen = await render(InlinePage);
	expect(text(screen.container, '[data-outer-wait]')).toBe('Loading team');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Team 0');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Members 0');
	expect(text(screen.container, '[data-inner-wait]')).toBeUndefined();
});

test('CSR: a child component @try inside a settled @try arm loads its own block', async () => {
	const screen = await render(ChildPage);
	expect(text(screen.container, '[data-outer-wait]')).toBe('Loading ship');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Ship 0');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Crew of Ship 0');
});

test('CSR: the inline inner @try refreshes after the outer settled', async () => {
	const screen = await render(InlinePage);
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Members 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Team 1');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Members 1');
});

test('CSR: the child component inner @try refreshes after the outer settled', async () => {
	const screen = await render(ChildPage);
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Crew of Ship 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Ship 1');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Crew of Ship 1');
});

test('SSR: an inline nested @try serves both blocks settled and the inner refreshes after resume', async () => {
	const screen = await renderSSR(InlinePage);
	expect(text(screen.container, 'h2')).toBe('Team 0');
	expect(text(screen.container, '[data-inner]')).toBe('Members 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Team 1');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Members 1');
});

test('SSR: a child component nested @try serves both blocks settled and the inner refreshes after resume', async () => {
	const screen = await renderSSR(ChildPage);
	expect(text(screen.container, 'h2')).toBe('Ship 0');
	expect(text(screen.container, '[data-inner]')).toBe('Crew of Ship 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h2')).toBe('Ship 1');
	await expect.poll(() => text(screen.container, '[data-inner]')).toBe('Crew of Ship 1');
});

test('CSR: a child component that nests its own @try blocks loads and refreshes both', async () => {
	const screen = await render(DeepPage);
	expect(text(screen.container, '[data-deck-wait]')).toBe('Shuffling');
	await expect.poll(() => text(screen.container, 'h3')).toBe('Deck 0');
	await expect.poll(() => text(screen.container, '[data-cards]')).toBe('Cards 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h3')).toBe('Deck 1');
	await expect.poll(() => text(screen.container, '[data-cards]')).toBe('Cards 1');
});

test('SSR: a child component that nests its own @try blocks serves both settled and refreshes after resume', async () => {
	const screen = await renderSSR(DeepPage);
	expect(text(screen.container, 'h3')).toBe('Deck 0');
	expect(text(screen.container, '[data-cards]')).toBe('Cards 0');
	click(screen.container, 'button[data-refresh]');
	await expect.poll(() => text(screen.container, 'h3')).toBe('Deck 1');
	await expect.poll(() => text(screen.container, '[data-cards]')).toBe('Cards 1');
});
