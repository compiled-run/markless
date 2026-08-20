import { cleanup, render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import App from './fixtures/base-parts.tsrx';

// The base namespace is reached the same way a consumer reaches it: through
// the @markless/ui barrel, which re-exports the internal base package.
afterEach(() => cleanup());

test('CSR: base one-offs render their single elements', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	const button = container.querySelector<HTMLButtonElement>('button');
	expect(button?.getAttribute('type')).toBe('button');
	expect(button?.textContent).toBe('Press');
	expect(button?.hasAttribute('aria-pressed')).toBe(false);
	// disabled is optional and this call omits it: no attribute, not an empty one.
	expect(button?.hasAttribute('disabled')).toBe(false);

	const label = container.querySelector('label');
	expect(label?.getAttribute('for')).toBe('field-id');
	expect(label?.textContent).toBe('Name');

	const hidden = container.querySelector('span.visually-hidden');
	expect(hidden?.textContent).toBe('Hidden');
	expect(getComputedStyle(hidden as Element).position).toBe('absolute');
});
