import { render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';

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
	// The scenario omits `disabled`, so no attribute at all rather than an empty one.
	expect(el(Button).hasAttribute('disabled')).toBe(false);

	expect(el(Label).tagName).toBe('LABEL');
	expect(el(Label).getAttribute('for')).toBe('field-id');

	// Located by its text, so it is still in the accessibility tree despite the clip.
	expect(el(Hidden).tagName).toBe('SPAN');
	expect(getComputedStyle(el(Hidden)).position).toBe('absolute');
	expect(el(Hidden).hasAttribute('class')).toBe(false);
});
