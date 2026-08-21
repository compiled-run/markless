import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/base-basic.tsrx';

// The base namespace is reached the same way a consumer reaches it: through
// the @markless/ui barrel, which re-exports the internal base package.
const Button = page.getByTestId('button');
const Label = page.getByTestId('label');
const Hidden = page.getByTestId('hidden');

afterEach(() => cleanup());

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

test('CSR: base one-offs render their single elements', async () => {
	await render(Basic);

	const button = el(Button).querySelector('button');
	expect(button?.getAttribute('type')).toBe('button');
	expect(button?.textContent).toBe('Press');
	expect(button?.hasAttribute('aria-pressed')).toBe(false);
	// disabled is optional and this call omits it: no attribute, not an empty one.
	expect(button?.hasAttribute('disabled')).toBe(false);

	const label = el(Label).querySelector('label');
	expect(label?.getAttribute('for')).toBe('field-id');
	expect(label?.textContent).toBe('Name');

	const hidden = el(Hidden).querySelector('span.visually-hidden');
	expect(hidden?.textContent).toBe('Hidden');
	expect(getComputedStyle(hidden as Element).position).toBe('absolute');
});
