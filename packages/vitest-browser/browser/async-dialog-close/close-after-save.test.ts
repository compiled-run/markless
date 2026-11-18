import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import PlainPage from './plain-page.tsrx';
import ResetPage from './reset-page.tsrx';
import { answerSaves } from './units.ts';

// A component inside an @if inside a @try closes its own @if after an awaited save, with and without a @catch (error, reset).
afterEach(async () => {
	answerSaves();
	await cleanup();
});

const WAIT = { timeout: 3_000, interval: 10 };
const dialog = () => document.querySelector('[data-dialog]');
const submitLabel = () => document.querySelector('[data-dialog] button[type=submit]')?.textContent ?? null;

async function dialogClosesAfterTheSave() {
	const errors: string[] = [];
	const onError = (event: ErrorEvent) => errors.push(event.message);
	const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	try {
		document.querySelector<HTMLButtonElement>('[data-open]')!.click();
		await expect.poll(() => document.querySelectorAll('[data-dialog] option').length, WAIT).toBe(3);
		const select = document.querySelector('select')!;
		select.value = 'south';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		const submit = new SubmitEvent('submit', { bubbles: true, cancelable: true });
		dialog()!.dispatchEvent(submit);
		await expect.poll(submitLabel, WAIT).toBe('Submitting');
		answerSaves();
		await expect.poll(dialog, WAIT).toBeNull();
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	}
}

test('CSR: the dialog closes after its save, with a @catch (error, reset)', async () => {
	await render(ResetPage);
	await dialogClosesAfterTheSave();
});

test('SSR: the dialog closes after its save, with a @catch (error, reset)', async () => {
	await renderSSR(ResetPage);
	await dialogClosesAfterTheSave();
});

test('CSR: the dialog closes after its save, without a @catch', async () => {
	await render(PlainPage);
	await dialogClosesAfterTheSave();
});

test('SSR: the dialog closes after its save, without a @catch', async () => {
	await renderSSR(PlainPage);
	await dialogClosesAfterTheSave();
});
