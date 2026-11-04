import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Deep from './forwarded-callback/deep.tsrx';
import Handed from './forwarded-callback/handed.tsrx';
import Forwarded from './forwarded-callback/page.tsrx';
import Repeated from './forwarded-callback/repeated.tsrx';
import SameModule from './forwarded-callback/same-module.tsrx';

afterEach(() => cleanup());

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

async function withoutPageErrors(run: () => Promise<void>) {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
	const onRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	try {
		await run();
		await settle();
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	}
}

// A component that spreads its props onto a button, rendered with a callback at one call site and
// without one at another: pressing the one without runs nothing, and each callback runs for its own instance.
async function eachCallSiteRunsItsOwnCallback(
	container: HTMLElement,
	shown: (to: string) => string | null | undefined,
	idle: (to: string) => string,
	picked: (to: string) => string,
) {
	const pick = (to: string) => container.querySelector<HTMLButtonElement>(`[data-pick="${to}"]`)!;
	await withoutPageErrors(async () => {
		container.querySelector<HTMLButtonElement>('[data-plain]')!.click();
		await settle();
		expect(shown('dark')).toBe(idle('dark'));
		expect(shown('light')).toBe(idle('light'));
		pick('light').click();
		await expect.poll(() => shown('light')).toBe(picked('light'));
		expect(shown('dark')).toBe(idle('dark'));
		pick('dark').click();
		await expect.poll(() => shown('dark')).toBe(picked('dark'));
	});
}

async function buttonTextShowsPick(container: HTMLElement) {
	await eachCallSiteRunsItsOwnCallback(
		container,
		(to) => container.querySelector(`[data-pick="${to}"]`)?.textContent,
		(to) => `${to} -> `,
		(to) => `${to} -> ${to}`,
	);
}

async function siblingShowsPick(container: HTMLElement) {
	await eachCallSiteRunsItsOwnCallback(
		container,
		(to) => container.querySelector(`[data-shown="${to}"]`)?.textContent,
		() => '',
		(to) => to,
	);
}

test('CSR: an imported spreading part nested a level down runs only its own callback', async () => {
	await buttonTextShowsPick((await render(Forwarded)).container as HTMLElement);
});
test('SSR resume: an imported spreading part nested a level down runs only its own callback', async () => {
	await buttonTextShowsPick((await renderSSR(Forwarded)).container as HTMLElement);
});
test('CSR: a spreading part from the same module runs only its own callback', async () => {
	await buttonTextShowsPick((await render(SameModule)).container as HTMLElement);
});
test('SSR resume: a spreading part from the same module runs only its own callback', async () => {
	await buttonTextShowsPick((await renderSSR(SameModule)).container as HTMLElement);
});
test('CSR: spreading parts nested several levels down run only their own callback', async () => {
	await buttonTextShowsPick((await render(Deep)).container as HTMLElement);
});
test('SSR resume: spreading parts nested several levels down run only their own callback', async () => {
	await buttonTextShowsPick((await renderSSR(Deep)).container as HTMLElement);
});
test('CSR: spreading parts in keyed @for rows run their own row callback', async () => {
	await siblingShowsPick((await render(Repeated)).container as HTMLElement);
});
test('SSR resume: spreading parts in keyed @for rows run their own row callback', async () => {
	await siblingShowsPick((await renderSSR(Repeated)).container as HTMLElement);
});

// One call site forwards a callback its own caller may or may not have passed, so instances differ.
async function anInstanceHandedNoCallbackRunsNone(container: HTMLElement) {
	const relay = (to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-relay="${to}"]`)!;
	const last = () => container.querySelector('[data-last]')!.textContent;
	await withoutPageErrors(async () => {
		relay('none').click();
		await settle();
		expect(last()).toBe('');
		relay('light').click();
		await expect.poll(last).toBe('light');
		relay('none').click();
		await settle();
		expect(last()).toBe('light');
		relay('dark').click();
		await expect.poll(last).toBe('dark');
	});
}

test('CSR: one spreading call site with a callback in some instances and none in others', async () => {
	await anInstanceHandedNoCallbackRunsNone((await render(Handed)).container as HTMLElement);
});
test('SSR resume: one spreading call site with a callback in some instances and none in others', async () => {
	await anInstanceHandedNoCallbackRunsNone((await renderSSR(Handed)).container as HTMLElement);
});
