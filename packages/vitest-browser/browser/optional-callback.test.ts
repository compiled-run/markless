import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AbsentPage from './fixtures/optional-callback-absent-page.tsrx';
import ImportedPage from './fixtures/optional-callback-imported-page.tsrx';
import LocalPage from './fixtures/optional-callback-local.tsrx';

// T015: a component that calls an optional callback prop must work for a
// consumer that passes one AND for a consumer that passes nothing. The absent
// edge folds to a compiler-known undefined, so the call no-ops instead of
// failing the build with MARKLESS_CAPTURE_OPAQUE_PROP.
afterEach(() => cleanup());

function required<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function watchPageErrors(): { readonly errors: string[]; readonly stop: () => void } {
	const errors: string[] = [];
	const onError = (event: ErrorEvent) => errors.push(String(event.message));
	const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		errors,
		stop: () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		},
	};
}

test('CSR: one same-module slot serves a callback edge and an absent edge', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await render(LocalPage)).container as HTMLElement;
	const watched = required<HTMLButtonElement>(container, '[data-local-stepper="watched"]');
	const silent = required<HTMLButtonElement>(container, '[data-local-stepper="silent"]');
	const observed = required<HTMLOutputElement>(container, '[data-local-observed]');

	expect(observed.textContent).toBe('none');

	// The edge that passes nothing must no-op instead of throwing
	// "is not a callback route" out of the shared handler symbol.
	silent.click();
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(observed.textContent).toBe('none');
	expect(errors).toEqual([]);

	watched.click();
	await expect.poll(() => observed.textContent).toBe('heard:watched');
	stop();
	expect(errors).toEqual([]);
});

test('CSR: an imported optional callback fires with the new value when passed', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await render(ImportedPage)).container as HTMLElement;
	const stepper = required<HTMLButtonElement>(container, '[data-imported-stepper="watched"]');
	const observed = required<HTMLOutputElement>(container, '[data-imported-observed]');

	expect(observed.textContent).toBe('none');
	expect(stepper.textContent).toBe('0');

	stepper.click();
	await expect.poll(() => observed.textContent).toBe('watched:1');
	expect(stepper.textContent).toBe('1');
	stop();
	expect(errors).toEqual([]);
});

test('CSR: the same component without a callback still updates its state', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await render(AbsentPage)).container as HTMLElement;
	const stepper = required<HTMLButtonElement>(container, '[data-imported-stepper="silent"]');

	expect(stepper.textContent).toBe('0');

	stepper.click();
	await expect.poll(() => stepper.textContent).toBe('1');
	stepper.click();
	await expect.poll(() => stepper.textContent).toBe('2');
	stop();
	expect(errors).toEqual([]);
});

test('SSR: a resumed component without a callback still updates its state', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await renderSSR(AbsentPage)).container;
	const stepper = required<HTMLButtonElement>(container, '[data-imported-stepper="silent"]');

	expect(stepper.textContent).toBe('0');

	stepper.click();
	await expect.poll(() => stepper.textContent).toBe('1');
	stop();
	expect(errors).toEqual([]);
});

test('SSR: a resumed optional callback still fires when the consumer passes one', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await renderSSR(ImportedPage)).container;
	const stepper = required<HTMLButtonElement>(container, '[data-imported-stepper="watched"]');
	const observed = required<HTMLOutputElement>(container, '[data-imported-observed]');

	stepper.click();
	await expect.poll(() => observed.textContent).toBe('watched:1');
	stop();
	expect(errors).toEqual([]);
});
