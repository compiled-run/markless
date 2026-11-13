import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { api, installApi, resetApi, type Failure } from './api.ts';
import { AroundPage } from './around-page.tsrx';
import { AroundSame } from './around-same.tsrx';
import { AroundOther } from './around-other.tsrx';
import { AroundDeep } from './around-deep.tsrx';
import { InsideSame } from './inside-same.tsrx';
import { InsideOther } from './inside-other.tsrx';
import { InsideDeep } from './inside-deep.tsrx';
import { NonePage } from './none-page.tsrx';
import { NoneSame } from './none-same.tsrx';
import { NoneOther } from './none-other.tsrx';
import { NoneDeep } from './none-deep.tsrx';

// A save that fails in a form's onSubmit or a button's onClick: the handler sits in the page, a child in the same
// file, a child in another file, or a grandchild; the @catch sits around the child, inside it, or nowhere.

installApi();
afterEach(() => cleanup());

// renderSSR is rewritten at build time, so each page is named at its own call.
const caught = {
	AroundPage: { CSR: () => render(AroundPage), SSR: () => renderSSR(AroundPage) },
	AroundSame: { CSR: () => render(AroundSame), SSR: () => renderSSR(AroundSame) },
	AroundOther: { CSR: () => render(AroundOther), SSR: () => renderSSR(AroundOther) },
	AroundDeep: { CSR: () => render(AroundDeep), SSR: () => renderSSR(AroundDeep) },
	InsideSame: { CSR: () => render(InsideSame), SSR: () => renderSSR(InsideSame) },
	InsideOther: { CSR: () => render(InsideOther), SSR: () => renderSSR(InsideOther) },
	InsideDeep: { CSR: () => render(InsideDeep), SSR: () => renderSSR(InsideDeep) },
};
const uncaught = {
	NonePage: { CSR: () => render(NonePage), SSR: () => renderSSR(NonePage) },
	NoneSame: { CSR: () => render(NoneSame), SSR: () => renderSSR(NoneSame) },
	NoneOther: { CSR: () => render(NoneOther), SSR: () => renderSSR(NoneOther) },
	NoneDeep: { CSR: () => render(NoneDeep), SSR: () => renderSSR(NoneDeep) },
};
const handlers = [
	['onSubmit', '[data-submit]'],
	['onClick', '[data-click]'],
] as const;
const failures: ReadonlyArray<readonly [Failure, string]> = [
	['http', 'Saving failed (500)'],
	['network', 'Failed to fetch'],
];

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;
const at = (container: ParentNode, selector: string) => {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected ${selector} in the rendered DOM.`);
	return element;
};

// Every line the shared announcer says from now until the test ends.
const observers: MutationObserver[] = [];
afterEach(() => observers.splice(0).forEach((observer) => observer.disconnect()));
function listen(): () => string[] {
	const said: string[] = [];
	const observer = new MutationObserver(() => {
		const line = document.querySelector('[data-markless-announcer]')?.textContent ?? '';
		if (line && said.at(-1) !== line) said.push(line);
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	observers.push(observer);
	return () => [...said];
}

// What the browser reports as uncaught, kept from failing the run.
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

type Mounts = {
	readonly CSR: () => ReturnType<typeof render>;
	readonly SSR: () => ReturnType<typeof renderSSR>;
};

async function mount(mode: 'CSR' | 'SSR', page: Mounts, failure: Failure) {
	resetApi(failure);
	const { container } = await page[mode]();
	await expect
		.poll(() => text(container, '[data-loads]'), { timeout: 5_000 })
		.toMatch(/^loads \d+$/);
	return container as HTMLElement;
}

for (const mode of ['CSR', 'SSR'] as const)
	for (const [handler, selector] of handlers)
		for (const [failure, message] of failures) {
			for (const [name, page] of Object.entries(caught))
				test(`${mode}: ${name}, ${handler} failing with ${failure}, shows in the nearest @catch and reset clears it`, async () => {
					const container = await mount(mode, page, failure);
					const said = listen();
					at(container, selector).click();
					await expect
						.poll(() => text(container, '[data-caught]'))
						.toBe(`caught: ${message}`);
					await expect.poll(() => text(container, '[data-note]')).toBe('sending');
					expect(api.posts).toBe(1);
					await expect
						.poll(
							() => container.querySelectorAll('[aria-busy], [aria-disabled]').length,
						)
						.toBe(0);
					// A slow save may say the busy line first; the closing line names the failure, and nothing says it was saved.
					await expect.poll(async () => said().at(-1)).toBe('Update failed');
					expect(said()).not.toContain('Updated');
					expect(text(container, '[data-caught]')).toBe(`caught: ${message}`);
					at(container, '[data-reset]').click();
					await expect.poll(() => container.querySelector('[data-caught]')).toBeNull();
					expect(text(container, '[data-note]')).toBe('sending');
					expect(reasons).toEqual([]);
				});
			for (const [name, page] of Object.entries(uncaught))
				test(`${mode}: ${name}, ${handler} failing with ${failure} and no @catch around it, stays uncaught`, async () => {
					const container = await mount(mode, page, failure);
					const said = listen();
					at(container, selector).click();
					await expect
						.poll(() => reasons.map((reason) => (reason as Error).message))
						.toEqual([message]);
					await expect.poll(() => text(container, '[data-note]')).toBe('sending');
					await expect
						.poll(
							() => container.querySelectorAll('[aria-busy], [aria-disabled]').length,
						)
						.toBe(0);
					await expect.poll(async () => said().at(-1)).toBe('Update failed');
					expect(said()).not.toContain('Updated');
				});
		}
