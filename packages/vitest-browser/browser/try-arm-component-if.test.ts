import { afterEach, expect, onTestFinished, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedElse from './try-arm-component-if/nested-else.tsrx';
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

function rejections(): unknown[] {
	const errors: unknown[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		errors.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	onTestFinished(() => window.removeEventListener('unhandledrejection', onRejection));
	return errors;
}

async function openThenTouch(container: Element) {
	container.querySelector<HTMLButtonElement>('[data-open]')?.click();
	await expect.poll(() => container.querySelector('[data-touch]')).not.toBeNull();
	expect(container.querySelector('[data-required]')).toBeNull();
	container.querySelector<HTMLButtonElement>('[data-touch]')?.click();
	await expect.poll(() => container.querySelector('[data-required]')?.textContent).toBe('Required');
}

async function expandThenToggle(container: Element) {
	const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
	await expect.poll(() => text('[data-summary]')).toBe('Summary');
	container.querySelector<HTMLButtonElement>('[data-expand]')?.click();
	await expect.poll(() => text('[data-total]')).toBe('7');
	expect(text('[data-off]')).toBe('Off');
	expect(text('[data-on]')).toBeNull();

	container.querySelector<HTMLButtonElement>('[data-detail]')!.click();
	await expect.poll(() => text('[data-on]')).toBe('On');
	expect(text('[data-off]')).toBeNull();
	expect(text('[data-early]')).toBe('Early');

	container.querySelector<HTMLButtonElement>('[data-detail]')!.click();
	await expect.poll(() => text('[data-off]')).toBe('Off');
	expect(text('[data-on]')).toBeNull();
	expect(text('[data-early]')).toBeNull();
}

test('served: a page @if nested in a closed @if inside an async @try resumes and opens', async () => {
	const errors = rejections();
	const { container } = await renderSSR(NestedInline);
	await openThenTouch(container);
	expect(errors).toEqual([]);
});

test('client: a page @if nested in a closed @if inside an async @try opens and follows its state', async () => {
	const errors = rejections();
	const { container } = await render(NestedInline);
	await openThenTouch(container);
	expect(errors).toEqual([]);
});

test('served: an @if/@else nested in the @else of an unopened @if inside an async @try resumes and flips', async () => {
	const errors = rejections();
	const { container } = await renderSSR(NestedElse);
	await expandThenToggle(container);
	expect(errors).toEqual([]);
});

test('client: an @if/@else nested in the @else of an unopened @if inside an async @try flips', async () => {
	const errors = rejections();
	const { container } = await render(NestedElse);
	await expandThenToggle(container);
	expect(errors).toEqual([]);
});

// A @try whose arm reads no async value renders @pending and never settles to its arm.
test.fails('client: a @try that reads nothing async shows its arm', async () => {
	const { container } = await render(SyncTry);
	await expect.poll(() => container.querySelector('[data-open]')?.textContent, { timeout: 500 }).toBe('Open');
	container.querySelector<HTMLButtonElement>('[data-open]')?.click();
	await expect.poll(() => container.querySelector('[data-shown]'), { timeout: 500 }).not.toBeNull();
});
