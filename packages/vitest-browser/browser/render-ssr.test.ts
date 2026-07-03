import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import Branch from './fixtures/branch.tsrx';
import Counter from './fixtures/counter.tsrx';

afterEach(() => cleanup());

test('SSR: server HTML resumes and the counter updates on first click', async () => {
	const screen = await renderSSR(Counter);
	const container = screen.container;

	// Server-render fingerprints no CSR path produces: the async container
	// root and the embedded payload scripts from renderToString.
	expect(container.querySelector('[data-async-container]')).not.toBeNull();
	expect(container.querySelector('script[type="markless/state"]')).not.toBeNull();
	expect(container.querySelector('script[type="markless/view"]')).not.toBeNull();
	expect(container.querySelector('script[data-async-resumer]')).not.toBeNull();

	const button = container.querySelector<HTMLButtonElement>('button[data-counter]');
	if (!button) throw new Error('Expected server-rendered counter button in the DOM.');
	expect(button.textContent).toBe('0');

	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('SSR: server-rendered @if branch flips after a resumed click', async () => {
	const screen = await renderSSR(Branch);
	const container = screen.container;

	expect(container.querySelector('[data-async-container]')).not.toBeNull();
	expect(container.querySelector('p.on')?.textContent).toBe('Shown');
	expect(container.querySelector('p.off')).toBeNull();

	const toggle = container.querySelector<HTMLButtonElement>('button[data-toggle]');
	if (!toggle) throw new Error('Expected server-rendered toggle button in the DOM.');
	toggle.click();

	await expect.poll(() => container.querySelector('p.off')?.textContent).toBe('Hidden');
	expect(container.querySelector('p.on')).toBeNull();
});
