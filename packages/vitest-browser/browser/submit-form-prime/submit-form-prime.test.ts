import { cleanup, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import FormPage from './form-page.tsrx';

// A form whose submit has a handler starts its page's code when the pointer reaches the submit button
// or focus enters the form, so the press itself does not wait for that code to load.
afterEach(() => cleanup());

type Root = Element & { __mResume?: Promise<unknown> };

function containerOf(container: ParentNode): Root {
	const root =
		(container as Element).closest?.('[data-async-container]') ??
		container.querySelector('[data-async-container]');
	if (!root) throw new Error('Expected the served container.');
	return root as Root;
}

function over(element: Element) {
	element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
}

test('a pointer over the submit button starts the code; over another button it does not', async () => {
	const { container } = await renderSSR(FormPage);
	const root = containerOf(container);
	await expect.poll(() => container.querySelector('[data-submit]')).not.toBeNull();
	over(container.querySelector('[data-plain]')!);
	expect(root.__mResume).toBeUndefined();
	over(container.querySelector('[data-submit]')!);
	expect(root.__mResume).toBeDefined();
	(container.querySelector('[data-submit]') as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('[data-sent]')?.textContent).toBe('sent');
});

test('focus entering the form starts the code', async () => {
	const { container } = await renderSSR(FormPage);
	const root = containerOf(container);
	await expect.poll(() => container.querySelector('[data-amount]')).not.toBeNull();
	expect(root.__mResume).toBeUndefined();
	(container.querySelector('[data-amount]') as HTMLInputElement).focus();
	expect(root.__mResume).toBeDefined();
});
