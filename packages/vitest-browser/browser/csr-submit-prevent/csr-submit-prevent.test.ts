import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import SubmitForm from './submit-form.tsrx';

afterEach(() => cleanup());

// The browser reads defaultPrevented when dispatchEvent returns; a cancel that lands after that lets the form post.
function submit(container: HTMLElement, selector: string): boolean {
	const form = container.querySelector<HTMLFormElement>(selector)!;
	const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
	form.dispatchEvent(event);
	return event.defaultPrevented;
}

test('CSR: a submit handler that calls preventDefault cancels the submit inside the dispatch, beside a list whose rows also handle submit', async () => {
	const screen = await render(SubmitForm);
	const container = screen.container as HTMLElement;
	const sent = () => container.querySelector('[data-sent]')!.textContent;

	expect(submit(container, 'form[data-plain]')).toBe(true);
	await expect.poll(sent).toBe('plain');

	expect(submit(container, 'form[data-after-write]')).toBe(true);
	await expect.poll(sent).toBe('write 1');
});

test('CSR: a handler that does not cancel leaves the submit to the browser', async () => {
	const screen = await render(SubmitForm);
	const container = screen.container as HTMLElement;
	expect(submit(container, 'form[data-native]')).toBe(false);
	await expect.poll(() => container.querySelector('[data-sent]')!.textContent).toBe('native');
});
