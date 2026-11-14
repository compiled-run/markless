import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import { boardRequest, installServer, release, resetServer } from '../composition-grid/grid-server.ts';
import OwnPage from './own-page.tsrx';
import NestPage from './nest-page.tsrx';
import SameModulePage from './same-module-page.tsrx';
import ListPage from './list-page.tsrx';

// A child with its own @try, inside a @try arm the server streams after the first flush.
installServer();
let pageErrors: string[] = [];
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
beforeEach(() => {
	resetServer();
	pageErrors = [];
	window.addEventListener('error', onError);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	cleanup();
});

const lines = () =>
	[...document.querySelectorAll<HTMLElement>('[data-g]')].map(
		(element) => `${element.dataset.g}: ${(element.textContent ?? '').replace(/\s+/g, ' ').trim()}`,
	);

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
	expect(shell, 'the shell serves the @pending arm').toContain('data-g="pending"');
	expect(appends.length, 'the @try arm streams after the shell').toBeGreaterThan(0);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
}

const title = 'title: a round 0';
const press = (at: number) => document.querySelectorAll<HTMLElement>('[data-flag]')[at]!.click();

test("a child's own @try, streamed: its button flips its @if, and flips back", async () => {
	await playStream(renderStream(OwnPage));
	await expect.poll(lines).toEqual([title, 'rows: one rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'hidden: one hidden']);
	press(0);
	await expect.poll(lines).toEqual([title, 'rows: one rows']);
	expect(pageErrors).toEqual([]);
});

test("a child's @try that holds a child with its own @try, streamed: each button flips its own @if, and flips back", async () => {
	await playStream(renderStream(NestPage));
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	press(1);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'hidden: outer hidden']);
	press(1);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'rows: outer rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	expect(pageErrors).toEqual([]);
});

test("a child's @try that holds a child from its own module with its own @try, streamed: each button flips its own @if", async () => {
	await playStream(renderStream(SameModulePage));
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	press(1);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'hidden: outer hidden']);
	press(0);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'hidden: outer hidden']);
	expect(pageErrors).toEqual([]);
});

// The inner child's prop is a literal its parent was handed, so it lives in the parent instance's own prop cell.
test("served: a child placed afresh by its parent's @try re-render keeps its props through its own @try's re-render", async () => {
	await renderSSR(NestPage);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'rows: outer rows']);
	press(1);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'hidden: outer hidden']);
	expect(pageErrors).toEqual([]);
});

test("a keyed list beside a child's own @try, streamed: a row drops, and the child's button still flips its @if", async () => {
	await playStream(renderStream(ListPage));
	await expect.poll(lines).toEqual([title, 'row: a one', 'row: a two', 'rows: one rows']);
	document.querySelector<HTMLElement>('[data-drop="a-one"]')!.click();
	await expect.poll(lines).toEqual([title, 'row: a two', 'rows: one rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'row: a two', 'hidden: one hidden']);
	press(0);
	await expect.poll(lines).toEqual([title, 'row: a two', 'rows: one rows']);
	expect(pageErrors).toEqual([]);
});

test("client-rendered: a child placed afresh by its parent's @try re-render keeps its props through its own @try's re-render", async () => {
	await render(NestPage);
	await expect.poll(() => release(boardRequest('a', 0))).toBe(true);
	await expect.poll(lines).toEqual([title, 'gate: outer open', 'rows: outer rows']);
	press(0);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'rows: outer rows']);
	press(1);
	await expect.poll(lines).toEqual([title, 'gate: outer shut', 'hidden: outer hidden']);
	expect(pageErrors).toEqual([]);
});
