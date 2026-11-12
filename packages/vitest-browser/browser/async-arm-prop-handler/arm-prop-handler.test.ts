import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import FlagPage from './flag-page.tsrx';
import FormPage from './form-page.tsrx';
import StreamedFlagPage from './streamed-flag-page.tsrx';
import StreamedFormPage from './streamed-form-page.tsrx';
import StreamedTabsPage from './streamed-tabs-page.tsrx';

// A child's @if arm holds a component with a handler and an @for or @if over the async value
// the child got as a prop; the arm is open at load, pressed as it paints, then closed and reopened.
// Streamed: the @try content arrives after the first flush, the child's @if inside it.

let pageErrors: string[] = [];
let submittedNatively = 0;
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
// Runs after the page's own listeners, so it sees whether one of them took the submit.
const onSubmit = (event: Event) => {
	if (!event.defaultPrevented) submittedNatively++;
	event.preventDefault();
};
beforeEach(() => {
	pageErrors = [];
	submittedNatively = 0;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('submit', onSubmit);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	window.removeEventListener('submit', onSubmit);
	cleanup();
});

const find = (selector: string) => document.querySelector<HTMLElement>(selector);
const handled = () => find('[data-handled]')?.textContent ?? null;
const items = () => [...document.querySelectorAll('li')].map((li) => li.textContent).join(' ');

// A stream append is parsed after the shell, so its inline scripts run as it lands.
function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

async function playStream(stream: ReturnType<typeof renderStream>) {
	const { shell, appends } = await stream;
	expect(appends.length).toBeGreaterThan(0);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
}

// Presses the element in the task that paints it, before anything a later task does.
function pressOnPaint(selector: string): Promise<void> {
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			const element = find(selector);
			if (!element) return;
			observer.disconnect();
			element.click();
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true });
	});
}

async function formHandlesSubmit(pressed: Promise<void>) {
	await pressed;
	await expect.poll(items).toBe('x y');
	await expect.poll(handled).toBe('1');
	find('[data-tab]')!.click();
	await expect.poll(() => find('[data-other]') !== null).toBe(true);
	find('[data-tab]')!.click();
	await expect.poll(items).toBe('x y');
	find('[data-submit]')!.click();
	await expect.poll(handled).toBe('1');
	expect(submittedNatively).toBe(0);
	expect(pageErrors).toEqual([]);
}

async function flagHandlesClick(pressed: Promise<void>) {
	await pressed;
	await expect.poll(() => find('[data-many]') !== null).toBe(true);
	await expect.poll(handled).toBe('1');
	find('[data-tab]')!.click();
	await expect.poll(() => find('[data-other]') !== null).toBe(true);
	find('[data-tab]')!.click();
	await expect.poll(() => find('[data-many]') !== null).toBe(true);
	find('[data-click]')!.click();
	await expect.poll(handled).toBe('1');
	expect(pageErrors).toEqual([]);
}

test('CSR: a form with a handler and an @for over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-submit]');
	await render(FormPage);
	await formHandlesSubmit(pressed);
});

test('SSR: a form with a handler and an @for over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-submit]');
	await renderSSR(FormPage);
	await formHandlesSubmit(pressed);
});

test('CSR: a handler and an @if over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-click]');
	await render(FlagPage);
	await flagHandlesClick(pressed);
});

test('SSR: a handler and an @if over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-click]');
	await renderSSR(FlagPage);
	await flagHandlesClick(pressed);
});

test('SSR stream: a form with a handler and an @for over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-submit]');
	await playStream(renderStream(StreamedFormPage));
	await formHandlesSubmit(pressed);
});

test('SSR stream: a handler and an @if over the async prop, in a child @if arm', async () => {
	const pressed = pressOnPaint('[data-click]');
	await playStream(renderStream(StreamedFlagPage));
	await flagHandlesClick(pressed);
});

test("SSR stream: a child's @if inside a streamed @try flips", async () => {
	await playStream(renderStream(StreamedTabsPage));
	await expect.poll(() => find('[data-first]')?.textContent ?? null).toBe('2');
	find('[data-tab]')!.click();
	await expect.poll(() => find('[data-other]') !== null).toBe(true);
	find('[data-tab]')!.click();
	await expect.poll(() => find('[data-first]')?.textContent ?? null).toBe('2');
	expect(pageErrors).toEqual([]);
});
