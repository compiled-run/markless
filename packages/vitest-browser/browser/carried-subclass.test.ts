import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { SubclassPage } from './carried-subclass/subclass-page.tsrx';

afterEach(() => cleanup());

async function countsFromTheSubclass(container: HTMLElement) {
	const text = () => container.querySelector('[data-bump]')?.textContent ?? null;
	await expect.poll(text).toBe('42');
	container.querySelector<HTMLElement>('[data-bump]')!.click();
	await expect.poll(text).toBe('43');
}

test('a state initializer that builds a subclass loads in a browser render', async () => {
	const { container } = await render(SubclassPage);
	await countsFromTheSubclass(container);
});

test('a state initializer that builds a subclass loads after server render and resume', async () => {
	const { container } = await renderSSR(SubclassPage);
	await countsFromTheSubclass(container);
});
