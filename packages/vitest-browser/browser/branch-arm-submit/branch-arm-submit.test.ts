import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NestedIfPage from './nested-if-page.tsrx';
import StateBranchPage from './state-branch-page.tsrx';
import TextBeforePage from './text-before-page.tsrx';

// A control inside an @if arm finds its own element after resume, whatever text or nested block stands before it.
afterEach(() => cleanup());

function submit(container: ParentNode): boolean {
	const form = container.querySelector<HTMLFormElement>('form[data-form]');
	if (!form) throw new Error('Expected the form on the page.');
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

const sent = (container: ParentNode) => container.querySelector('[data-sent]')?.textContent;

async function expectTextBeforeForm(container: HTMLElement) {
	expect(submit(container)).toBe(true);
	await expect.poll(() => sent(container)).toBe('1');
	container.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await expect
		.poll(() => container.querySelector('section')?.textContent)
		.toContain('Total 3 items');
	expect(submit(container)).toBe(true);
	await expect.poll(() => sent(container)).toBe('2');
}

async function expectNestedIfBeforeForm(container: HTMLElement) {
	expect(submit(container)).toBe(true);
	await expect.poll(() => sent(container)).toBe('1');
	container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
	await expect.poll(() => container.querySelector('[data-note]')).toBeNull();
	expect(submit(container)).toBe(true);
	await expect.poll(() => sent(container)).toBe('2');
	container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
	await expect.poll(() => container.querySelector('[data-note]')).not.toBeNull();
	expect(submit(container)).toBe(true);
	await expect.poll(() => sent(container)).toBe('3');
}

test('SSR: a form in an @if on state cancels its submit', async () => {
	expect(submit((await renderSSR(StateBranchPage)).container)).toBe(true);
});

test('SSR: a form after interpolated text in an arm submits through its own handler', async () => {
	await expectTextBeforeForm((await renderSSR(TextBeforePage)).container as HTMLElement);
});

test('CSR: a form after interpolated text in an arm submits through its own handler', async () => {
	await expectTextBeforeForm((await render(TextBeforePage)).container as HTMLElement);
});

test('SSR: a form after a nested @if in an arm submits through its own handler', async () => {
	await expectNestedIfBeforeForm((await renderSSR(NestedIfPage)).container as HTMLElement);
});

test('CSR: a form after a nested @if in an arm submits through its own handler', async () => {
	await expectNestedIfBeforeForm((await render(NestedIfPage)).container as HTMLElement);
});
