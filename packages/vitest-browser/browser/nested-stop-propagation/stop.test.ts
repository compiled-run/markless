import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderServerHTML, renderStream } from '../../src/index.ts';
import { parkPointerBeforeMount, settledCount } from '../demand-load-replay/counting.ts';
import StopHtmlPage from './stop-html-page.tsrx';
import StopPage from './stop-page.tsrx';
import StopStreamPage from './stop-stream-page.tsrx';

// A handler that calls stopPropagation() keeps its ancestors' handlers for the
// same event from running, even when the walk runs after the browser's dispatch
// has ended and reset the event's own stop flag.

afterEach(async () => {
	await cleanup();
});

const text = (testid: string) => page.getByTestId(testid).element().textContent ?? '';

const pressDown = (testid: string) =>
	page
		.getByTestId(testid)
		.element()
		.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				composed: true,
				isPrimary: true,
				buttons: 1,
			}),
		);

async function mountSvg(mode: 'CSR' | 'SSR'): Promise<void> {
	if (mode === 'CSR') await render(StopPage);
	else await renderSSR(StopPage);
}

async function mountHtml(mode: 'CSR' | 'SSR'): Promise<void> {
	if (mode === 'CSR') await render(StopHtmlPage);
	else await renderSSR(StopHtmlPage);
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a nested SVG pointerdown that stops propagation keeps the @if arm root's from running`, async () => {
		await parkPointerBeforeMount();
		await mountSvg(mode);
		pressDown('close-mark');
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('close;');
	});

	test(`${mode}: the same stop holds in an @if arm the browser rebuilt`, async () => {
		await parkPointerBeforeMount();
		await mountSvg(mode);
		await userEvent.click(page.getByTestId('bin'));
		await expect.poll(() => document.querySelector('[data-testid="note"]')).toBeNull();
		await userEvent.click(page.getByTestId('reopen'));
		await expect.poll(() => document.querySelector('[data-testid="note"]')).not.toBeNull();
		pressDown('close-mark');
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('close;');
	});

	test(`${mode}: a nested pointerdown that stops propagation keeps its parent's from running`, async () => {
		await parkPointerBeforeMount();
		await mountHtml(mode);
		pressDown('plain-mark');
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('inner;');
	});

	test(`${mode}: a real press on the nested element runs only its own pointerdown`, async () => {
		await parkPointerBeforeMount();
		await mountHtml(mode);
		await userEvent.click(page.getByTestId('plain-mark'));
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('inner;');
	});

	test(`${mode}: the stop holds once an earlier click has started the page`, async () => {
		await parkPointerBeforeMount();
		await mountHtml(mode);
		await userEvent.click(page.getByTestId('reopen'));
		pressDown('plain-mark');
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('inner;');
	});

	test(`${mode}: a nested pointerdown in an @if arm that stops propagation keeps the arm root's from running`, async () => {
		await parkPointerBeforeMount();
		await mountHtml(mode);
		pressDown('close-mark');
		await settledCount(() => text('order').length);
		expect(text('order')).toBe('close;');
	});
}

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

test("SSR stream: a nested pointerdown in a streamed arm that stops propagation keeps its parent's from running", async () => {
	await parkPointerBeforeMount();
	const { shell, appends } = await renderStream(StopStreamPage);
	expect(appends.length).toBeGreaterThan(0);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(() => document.querySelector('[data-testid="shelf-mark"]')).not.toBeNull();
	pressDown('shelf-mark');
	await settledCount(() => text('order').length);
	expect(text('order')).toBe('mark;');
});
