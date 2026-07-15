import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import Branch from './fixtures/branch.tsrx';
import Counter from './fixtures/counter.tsrx';
import RuntimeActions from './fixtures/runtime-actions.tsrx';

afterEach(() => cleanup());

test('SSR: server HTML preserves counter state across warm clicks', async () => {
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

	button.click();
	await expect.poll(() => button.textContent).toBe('2');
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

test('SSR: scalar actions persist independently and hand their warm values to full resume', async () => {
	const screen = await renderSSR(RuntimeActions);
	const container = screen.container;
	const count = container.querySelector<HTMLOutputElement>('output[data-count]');
	const other = container.querySelector<HTMLOutputElement>('output[data-other-count]');
	if (!count || !other) throw new Error('Expected both runtime-action outputs.');
	const click = (selector: string) => {
		const button = container.querySelector<HTMLButtonElement>(selector);
		if (!button) throw new Error(`Expected runtime-action button ${selector}.`);
		button.click();
	};

	expect(count.textContent).toBe('0');
	expect(other.textContent).toBe('10');

	click('button[data-increment]');
	await expect.poll(() => count.textContent).toBe('1');
	click('button[data-increment]');
	await expect.poll(() => count.textContent).toBe('2');
	click('button[data-decrement]');
	await expect.poll(() => count.textContent).toBe('1');
	click('button[data-assign]');
	await expect.poll(() => count.textContent).toBe('7');
	click('button[data-other]');
	await expect.poll(() => other.textContent).toBe('11');

	// This expression is deliberately outside the scalar specialization. The
	// full runtime must adopt both warm scalar values before evaluating it.
	click('button[data-double]');
	await expect.poll(() => count.textContent).toBe('14');
	expect(other.textContent).toBe('11');

	click('button[data-increment]');
	await expect.poll(() => count.textContent).toBe('15');
});
