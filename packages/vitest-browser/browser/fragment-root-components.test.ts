import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import Page from './fixtures/fragment-root-components.tsrx';

// A fragment root holding components, inside an element and as direct children, renders and stays live.

afterEach(cleanup);

async function exercise(container: ParentNode) {
	const counter = (name: string) =>
		container.querySelector(`[data-counter="${name}"]`) as HTMLButtonElement;
	const layerOpen = () => container.querySelector('[data-layer-open]')?.textContent;

	expect(container.querySelector('main h1')?.textContent).toBe('Fragment root');
	expect(counter('first').textContent).toBe('0');
	expect(counter('second').textContent).toBe('0');
	expect(layerOpen()).toBe('closed');

	counter('first').click();
	await expect.poll(() => counter('first').textContent).toBe('1');
	counter('second').click();
	counter('second').click();
	await expect.poll(() => counter('second').textContent).toBe('2');
	expect(counter('first').textContent).toBe('1');

	(container.querySelector('[data-layer-toggle]') as HTMLButtonElement).click();
	await expect.poll(layerOpen).toBe('open');

	const note = () => container.querySelector('[data-note]');
	expect(note()?.textContent).toBe('note');
	(container.querySelector('[data-note-toggle]') as HTMLButtonElement).click();
	await expect.poll(note).toBeNull();
	(container.querySelector('[data-note-toggle]') as HTMLButtonElement).click();
	await expect.poll(() => note()?.textContent).toBe('note');
	expect(counter('first').textContent).toBe('1');

	expect(container.querySelector('section [data-pair]')?.textContent).toBe('pair');
	counter('third').click();
	await expect.poll(() => counter('third').textContent).toBe('1');
	expect(counter('first').textContent).toBe('1');
}

test('CSR: a fragment root renders its components and each keeps its own state', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: a fragment root resumes its components and each keeps its own state', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
