import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import Branch from './fixtures/branch.tsrx';
import Counter from './fixtures/counter.tsrx';

afterEach(() => cleanup());

function queryContainer(container: unknown): HTMLElement {
	return container as HTMLElement;
}

test('CSR: compiled counter click updates the real DOM', async () => {
	const screen = await render(Counter);
	const container = queryContainer(screen.container);
	const button = container.querySelector<HTMLButtonElement>('button[data-counter]');
	if (!button) throw new Error('Expected compiled counter button in the DOM.');

	expect(button.textContent).toBe('0');
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('CSR: compiled @if branch flips in the real DOM after a state write', async () => {
	const screen = await render(Branch);
	const container = queryContainer(screen.container);
	const toggle = container.querySelector<HTMLButtonElement>('button[data-toggle]');
	if (!toggle) throw new Error('Expected compiled toggle button in the DOM.');

	expect(container.querySelector('p.on')?.textContent).toBe('Shown');
	expect(container.querySelector('p.off')).toBeNull();

	toggle.click();
	await expect.poll(() => container.querySelector('p.off')?.textContent).toBe('Hidden');
	expect(container.querySelector('p.on')).toBeNull();
});
