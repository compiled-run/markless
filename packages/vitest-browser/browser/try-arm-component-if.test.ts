import { afterEach, expect, onTestFinished, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedInline from './try-arm-component-if/nested-inline.tsrx';
import Page from './try-arm-component-if/page.tsrx';
import PanelPage from './try-arm-component-if/panel-page.tsrx';
import SyncTry from './try-arm-component-if/sync-try.tsrx';

// A component an @if opens inside an async @try keeps its own @if live: the
// flip's commit rewires the branches its fresh range holds, the component's too.
afterEach(() => cleanup());

async function touchThenPick(container: Element) {
	const required = () => container.querySelector('[data-required]')?.textContent ?? null;
	const save = () => container.querySelector<HTMLButtonElement>('button[type=submit]');
	container.querySelector<HTMLButtonElement>('[data-open]')?.click();
	await expect.poll(save).not.toBeNull();
	expect(save()?.disabled).toBe(true);
	expect(required()).toBeNull();

	container.querySelector<HTMLButtonElement>('[data-touch]')?.click();
	await expect.poll(required).toBe('Required');

	const select = container.querySelector('select')!;
	select.value = 'a';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	await expect.poll(() => save()?.disabled).toBe(false);
	await expect.poll(required).toBeNull();
}

async function showThenWarn(container: Element) {
	const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
	const warn = () => container.querySelector<HTMLButtonElement>('[data-warn]');
	await expect.poll(() => text('[data-closed]')).toBe('Closed');
	container.querySelector<HTMLButtonElement>('[data-show]')?.click();
	await expect.poll(warn).not.toBeNull();
	expect(text('legend')).toBe('3');
	expect(text('[data-calm]')).toBe('Calm');

	warn()!.click();
	await expect.poll(() => warn()?.getAttribute('aria-pressed')).toBe('true');
	await expect.poll(() => text('[data-warning]')).toBe('Careful');
	expect(text('[data-calm]')).toBeNull();

	warn()!.click();
	await expect.poll(() => text('[data-calm]')).toBe('Calm');
	expect(text('[data-warning]')).toBeNull();
}

test('served: an @if in a component opened inside an async @try follows its state', async () => {
	const { container } = await renderSSR(Page);
	await touchThenPick(container);
});

test('client: an @if in a component opened inside an async @try follows its state', async () => {
	const { container } = await render(Page);
	await touchThenPick(container);
});

test('served: an @if/@else in a component an @else opens inside an async @try flips both ways', async () => {
	const { container } = await renderSSR(PanelPage);
	await showThenWarn(container);
});

test('client: an @if/@else in a component an @else opens inside an async @try flips both ways', async () => {
	const { container } = await render(PanelPage);
	await showThenWarn(container);
});

// The served @try arm carries a record for the inner @if although its closed outer @if rendered no anchors for it, so resume throws.
test.fails('served: a page @if nested in a closed @if inside an async @try resumes and opens', async () => {
	const errors: unknown[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		errors.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	onTestFinished(() => window.removeEventListener('unhandledrejection', onRejection));
	const { container } = await renderSSR(NestedInline);
	container.querySelector<HTMLButtonElement>('[data-open]')?.click();
	await expect.poll(() => container.querySelector('[data-touch]'), { timeout: 500 }).not.toBeNull();
	container.querySelector<HTMLButtonElement>('[data-touch]')?.click();
	await expect.poll(() => container.querySelector('[data-required]'), { timeout: 500 }).not.toBeNull();
	expect(errors).toEqual([]);
});

// A @try whose arm reads no async value renders @pending and never settles to its arm.
test.fails('client: a @try that reads nothing async shows its arm', async () => {
	const { container } = await render(SyncTry);
	await expect.poll(() => container.querySelector('[data-open]')?.textContent, { timeout: 500 }).toBe('Open');
	container.querySelector<HTMLButtonElement>('[data-open]')?.click();
	await expect.poll(() => container.querySelector('[data-shown]'), { timeout: 500 }).not.toBeNull();
});
