import { render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';

// The base namespace is reached the same way a consumer reaches it: through
// the @markless/ui barrel, which re-exports the internal base package.
// Parts are located the way a person finds them: by role and by text.
const Button = page.getByRole('button', { name: 'Press' });
const Label = page.getByText('Name');
const Hidden = page.getByText('Hidden');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

test('CSR: base one-offs render their single elements', async () => {
	await render(Basic);

	await expect.element(Button).toBeInTheDocument();
	expect(el(Button).getAttribute('type')).toBe('button');
	expect(el(Button).hasAttribute('aria-pressed')).toBe(false);
	// disabled is optional and this call omits it: no attribute, not an empty one.
	expect(el(Button).hasAttribute('disabled')).toBe(false);

	expect(el(Label).tagName).toBe('LABEL');
	expect(el(Label).getAttribute('for')).toBe('field-id');

	// Hidden from sight, still in the accessibility tree: findable by its text,
	// clipped by inline style, and shipping no class a stylesheet could target.
	expect(el(Hidden).tagName).toBe('SPAN');
	expect(getComputedStyle(el(Hidden)).position).toBe('absolute');
	expect(el(Hidden).hasAttribute('class')).toBe(false);
});
