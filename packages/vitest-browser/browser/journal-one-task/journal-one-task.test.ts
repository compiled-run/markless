import { cleanup, render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SoleReaderPage from '../seeded-write/sole-reader.tsrx';

// One test per file on purpose: its write is the first in the file to move a branch, so the journal's range code is not loaded yet.
const errors: string[] = [];
const onError = (event: ErrorEvent) => errors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	cleanup();
});

test('CSR: a text and the branch beside it land in one task, and a teardown right after reports nothing', async () => {
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	const container = (await render(SoleReaderPage)).container as HTMLElement;
	const text = (selector: string) => container.querySelector(selector)?.textContent?.trim();
	const caption = new Promise<string | undefined>((resolve) => {
		const observer = new MutationObserver(() => {
			if (text('[data-gauge-note]') !== '60 of 100 rows') return;
			observer.disconnect();
			resolve(text('[data-gauge-caption]'));
			void cleanup();
		});
		observer.observe(container, { subtree: true, childList: true, characterData: true });
	});
	container.querySelector<HTMLButtonElement>('[data-advance]')!.click();
	expect(await caption).toBe('60 of 100 rows');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(errors).toEqual([]);
});
