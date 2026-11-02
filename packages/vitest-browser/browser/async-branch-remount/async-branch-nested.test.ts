import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Workspace from './abr-deep-host.tsrx';
import FillPage from './abr-fill-page.tsrx';
import LayeredPage from './abr-layer-host.tsrx';
import SearchHost from './abr-nested-host.tsrx';

afterEach(cleanup);

const list = () => document.querySelector<HTMLElement>('[data-list]');
const names = () => [...document.querySelectorAll('[data-result]')].map((node) => node.textContent?.trim());
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const type = (value: string) => {
	const query = document.querySelector<HTMLInputElement>('[data-query]')!;
	query.value = value;
	query.dispatchEvent(new Event('input', { bubbles: true }));
};
const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

async function searchOpensFresh(all: string[], narrowed: [string, string[]], widened: [string, string[]]) {
	expect(list()).toBeNull();
	click('[data-open]');
	await expect.poll(names).toEqual(all);
	const first = list()!;
	first.scrollTop = 30;

	click('[data-open]');
	await expect.poll(list).toBeNull();
	expect(first.isConnected).toBe(false);

	type(narrowed[0]);
	click('[data-open]');
	await expect.poll(names).toEqual(narrowed[1]);
	const second = list()!;
	expect(second).not.toBe(first);
	expect(second.scrollTop).toBe(0);
	expect(document.querySelectorAll('[data-list]')).toHaveLength(1);

	type(widened[0]);
	await expect.poll(names).toEqual(widened[1]);
	expect(list()).toBe(second);
	expect(errors).toEqual([]);
}

const COMPONENTS = ['Accordion', 'Alert', 'Badge', 'Button', 'Calendar', 'Card', 'Dialog', 'Drawer'];
const shadcnSteps = () =>
	searchOpensFresh(COMPONENTS, ['dr', ['Drawer']], ['ca', ['Calendar', 'Card']]);

test('CSR: an @if holding a @try block renders fresh inside a component another one renders', async () => {
	await render(SearchHost);
	await shadcnSteps();
});

test('SSR: an @if holding a @try block renders fresh inside a component another one renders', async () => {
	await renderSSR(SearchHost);
	await shadcnSteps();
});

test('CSR: an @if holding a @try block renders fresh two components down', async () => {
	await render(Workspace);
	await shadcnSteps();
});

test('SSR: an @if holding a @try block renders fresh two components down', async () => {
	await renderSSR(Workspace);
	await shadcnSteps();
});

async function layeredSteps() {
	expect(document.querySelector('[data-layer]')?.getAttribute('data-fill')).toBe('dim');
	await searchOpensFresh(
		['Apple', 'Apricot', 'Banana', 'Cherry'],
		['ap', ['Apple', 'Apricot']],
		['b', ['Banana']],
	);
	expect(list()?.getAttribute('data-tint')).toBe('blue');
}

test('CSR: an @if holding a @try block renders fresh, props and all, inside a layer component', async () => {
	await render(LayeredPage);
	await layeredSteps();
});

test('SSR: an @if holding a @try block renders fresh, props and all, inside a layer component', async () => {
	await renderSSR(LayeredPage);
	await layeredSteps();
});

async function filledArmKeepsItsProp() {
	click('[data-show]');
	await expect.poll(() => document.querySelector('[data-filled]')?.getAttribute('data-fill')).toBe('dim');
	click('[data-tally]');
	await expect.poll(() => document.querySelector('[data-tally]')?.textContent).toBe('1 hits');
	click('[data-show]');
	await expect.poll(() => document.querySelector('[data-filled]')).toBeNull();
	click('[data-show]');
	await expect.poll(() => document.querySelector('[data-tally]')?.textContent).toBe('0 hits');
	expect(document.querySelector('[data-filled]')?.getAttribute('data-fill')).toBe('dim');
	expect(errors).toEqual([]);
}

test('CSR: an @if rendered in the browser inside a layer component reads its prop and runs its component fresh', async () => {
	await render(FillPage);
	await filledArmKeepsItsProp();
});

test('SSR: an @if rendered in the browser inside a layer component reads its prop and runs its component fresh', async () => {
	await renderSSR(FillPage);
	await filledArmKeepsItsProp();
});
