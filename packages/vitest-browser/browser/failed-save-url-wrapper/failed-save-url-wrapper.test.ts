import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { installApi } from './api.ts';
import { ComputedEditPage } from './computed-edit-page.tsrx';
import { EditPage } from './edit-page.tsrx';

// A failed save in a @try whose value reads a page prop, inside a wrapper that keeps state from another page prop.

installApi();
afterEach(() => cleanup());

const reasons: unknown[] = [];
const onError = (event: ErrorEvent) => {
	reasons.push(event.error);
	event.preventDefault();
};
const onRejection = (event: PromiseRejectionEvent) => {
	reasons.push(event.reason);
	event.preventDefault();
};
beforeEach(() => {
	reasons.length = 0;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
});

const wrappers = {
	'state(...)': { CSR: () => render(EditPage), SSR: () => renderSSR(EditPage) },
	'computed(() => url.search)': { CSR: () => render(ComputedEditPage), SSR: () => renderSSR(ComputedEditPage) },
};

for (const [wrapper, pages] of Object.entries(wrappers))
	for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: a wrapper with ${wrapper}: the failure shows in @catch and the wrapper's value is not worked out again`, async () => {
		const { container } = await pages[mode]();
		await expect
			.poll(() => container.querySelector<HTMLInputElement>('input[name=first]')?.value)
			.toBe('Ada a1');
		expect(container.querySelector('[data-q]')?.textContent).toBe('q=x');
		container.querySelector<HTMLButtonElement>('[data-submit]')!.click();
		await expect
			.poll(() => container.querySelector('[data-caught]')?.textContent)
			.toBe('Saving failed (500)');
		expect(container.querySelector('[data-q]')?.textContent).toBe('q=x');
		expect(reasons).toEqual([]);
	});
