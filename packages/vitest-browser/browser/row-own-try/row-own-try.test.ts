import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import InlineRowsPage from './inline-page.tsrx';
import RowsPage from './rows-page.tsrx';

// Keyed rows whose child each holds its own @try: every row must show its own value, never another row's.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const counts = () => [...document.querySelectorAll('[data-count]')].map((cell) => cell.textContent);
const loading = () => document.querySelectorAll('[data-count-loading]').length;
const own = ['Pen: 10', 'Ink: 20'];
const refreshed = ['Nib: 30', 'Cap: 40'];

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

// The list's arm commits first, so both rows paint their @pending, then each row's value lands.
async function settleRows(round: number) {
	await reply(`items:${round}`);
	await expect.poll(loading).toBe(2);
	await reply(`count:${round * 2 + 1}`);
	await reply(`count:${round * 2 + 2}`);
	await expect.poll(counts).toEqual(round ? refreshed : own);
}

test("CSR: rows still pending when the list's arm commits each settle to their own value", async () => {
	await render(RowsPage);
	await settleRows(0);
});

test("SSR: after a refresh re-commits the list's arm with every row pending, each row settles to its own value", async () => {
	await renderSSR(RowsPage);
	expect(counts()).toEqual(own);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleRows(1);
});

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

test("streamed: rows whose own @try is slower than the list's arm each show their own value, and after a refresh too", async () => {
	const { shell, appends } = await renderStream(RowsPage);
	expect(appends.length, 'the list arm streams after the shell').toBeGreaterThan(0);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(own);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleRows(1);
});

// Inline row @try blocks share one boundary id, and the async wiring keeps one boundary per id, so only the last row is wired.
async function settleInline(round: number) {
	await reply(`items:${round}`);
	await expect.poll(loading).toBe(2);
	await reply(`stock:${round}`);
	await expect.poll(counts).toEqual(round ? refreshed : own);
}

test.fails("CSR: inline row @try blocks still pending when the list's arm commits each settle to their own value", async () => {
	await render(InlineRowsPage);
	await settleInline(0);
});

test.fails('SSR: after a refresh, inline row @try blocks each settle to their own value', async () => {
	await renderSSR(InlineRowsPage);
	expect(counts()).toEqual(own);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1);
});

test("streamed: inline row @try blocks slower than the list's arm each show their own value", async () => {
	const { shell, appends } = await renderStream(InlineRowsPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(own);
});

test.fails('streamed: after a refresh, inline row @try blocks each settle to their own value', async () => {
	const { shell, appends } = await renderStream(InlineRowsPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(own);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1);
});
