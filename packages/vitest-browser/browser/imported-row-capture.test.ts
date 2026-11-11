import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderStream } from '../src/index.ts';
import { ImportedPage } from './imported-row-capture/imported-page.tsrx';
import { List } from './imported-row-capture/list.tsrx';
import { SoloPage } from './imported-row-capture/solo-page.tsrx';
import { TrimmedList } from './imported-row-capture/trimmed-list.tsrx';
import { TrimmedPage } from './imported-row-capture/trimmed-page.tsrx';

// A row component's props reach its text whichever module places it in a keyed @for, and whether its row streams in.
const pages = [
	{
		shape: 'imported from a module that also lists it',
		stream: () => renderStream(ImportedPage),
		csr: () => render(ImportedPage),
	},
	{
		shape: 'imported from a module that also lists it, given a value worked out from the row',
		stream: () => renderStream(TrimmedPage),
		csr: () => render(TrimmedPage),
	},
	{
		shape: 'listed in its own module',
		stream: () => renderStream(List),
		csr: () => render(List),
	},
	{
		shape: 'listed in its own module, given a value worked out from the row',
		stream: () => renderStream(TrimmedList),
		csr: () => render(TrimmedList),
	},
	{
		shape: 'imported from a module that only defines it',
		stream: () => renderStream(SoloPage),
		csr: () => render(SoloPage),
	},
] as const;

const WAIT = { timeout: 5_000, interval: 10 };
const textOf = (selector: string) =>
	document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const click = (selector: string) => {
	const target = document.querySelector<HTMLElement>(selector);
	if (!target) throw new Error(`Expected ${selector} in the rendered DOM.`);
	target.click();
};

let uncaught: unknown[] = [];
const keep = (event: ErrorEvent) => uncaught.push(event.error ?? event.message);
beforeEach(() => {
	uncaught = [];
	window.addEventListener('error', keep);
});
afterEach(async () => {
	window.removeEventListener('error', keep);
	await cleanup();
});

/** Presses a row's Next twice; its joined text (with and without an async value) and its single read follow. */
async function rowCounts(id: string) {
	const row = `[data-row="${id}"]`;
	const plain = `[data-plain="${id}"]`;
	await expect.poll(() => textOf(`${row} [data-text]`), WAIT).toBe(`${id}: ${id} note try 1`);
	expect(textOf(`${plain} [data-text]`)).toBe(`${id} try 1`);
	for (const tries of [2, 3]) {
		click(`${row} [data-next]`);
		click(`${plain} [data-next]`);
		await expect.poll(() => textOf(`${row} [data-count]`), WAIT).toBe(`${tries}`);
		await expect
			.poll(() => textOf(`${row} [data-text]`), WAIT)
			.toBe(`${id}: ${id} note try ${tries}`);
		await expect.poll(() => textOf(`${plain} [data-count]`), WAIT).toBe(`${tries}`);
		await expect.poll(() => textOf(`${plain} [data-text]`), WAIT).toBe(`${id} try ${tries}`);
	}
	expect(uncaught).toEqual([]);
}

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

async function streamed(stream: (typeof pages)[number]['stream']) {
	const { shell, appends } = await stream();
	expect(appends).toHaveLength(1);
	const { container } = renderServerHTML(shell);
	expect(textOf('[data-row="slow"] [data-pending]')).toBe('Loading slow');
	for (const chunk of appends) appendStreamed(container, chunk);
	// The streamed row commits on the arm scheduler; waiting for it keeps that commit inside this test.
	await expect.poll(() => textOf('[data-row="slow"] [data-text]'), WAIT).not.toBeNull();
}

for (const { shape, stream, csr } of pages) {
	test(`SSR, row streamed after the first flush, ${shape}`, async () => {
		await streamed(stream);
		await rowCounts('slow');
	});

	test(`SSR, row in the first flush, ${shape}`, async () => {
		await streamed(stream);
		await rowCounts('north');
	});

	test(`CSR, rows rendered and added in the browser, ${shape}`, async () => {
		await csr();
		await rowCounts('slow');
		click('[data-add]');
		await rowCounts('east');
	});

	test(`SSR, row added in the browser, ${shape}`, async () => {
		await streamed(stream);
		click('[data-add]');
		await rowCounts('east');
	});
}
