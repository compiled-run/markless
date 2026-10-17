import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../src/index.ts';
import App from './fixtures/void-elements.tsrx';
import Head from './fixtures/void-head-elements.tsrx';

afterEach(() => cleanup());

const voidTags = [
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
];

test('SSR writes void elements without a closing tag, so the browser parses each once', async () => {
	const { html, mount } = await renderSSRPhased(App);
	for (const tag of voidTags) expect(html).not.toContain(`</${tag}>`);

	const screen = mount();
	expect(screen.container.querySelectorAll('br')).toHaveLength(2);
	expect(screen.container.querySelectorAll('p br')).toHaveLength(2);

	const button = screen.container.querySelector<HTMLButtonElement>('[data-bump]')!;
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('SSR writes head void elements without a closing tag', async () => {
	const { html } = await renderSSRPhased(Head);
	expect(html).toContain('<base href="/">');
	for (const tag of ['base', 'link', 'meta']) expect(html).not.toContain(`</${tag}>`);
});

test('CSR mounts each void element once', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;
	expect(container.querySelectorAll('br')).toHaveLength(2);
	expect(container.innerHTML).not.toContain('</br>');
});
