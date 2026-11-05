import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedChildFlip from './imported-child-flip.tsrx';
import ServedChildSwitch from './served-child-switch.tsrx';
import StatefulChildToggle from './stateful-child-toggle.tsrx';

// An @if inside a @try arm whose branch holds a component that has to run flips only its own range.

afterEach(cleanup);

const LOADS = { timeout: 5_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

function focusField(): HTMLInputElement | HTMLTextAreaElement {
	const field = document.querySelector('[data-field]') as HTMLInputElement;
	field.focus();
	field.value = 'typed';
	return field;
}

// Every distinct state the browser could paint: judged when a task ends and before each frame.
function paintedStates(read: () => string): () => string[] {
	const seen = [read()];
	const record = () => seen.at(-1) !== read() && seen.push(read());
	const channel = new MessageChannel();
	channel.port1.onmessage = record;
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
	let frame = requestAnimationFrame(function sample() {
		record();
		frame = requestAnimationFrame(sample);
	});
	return () => {
		observer.disconnect();
		cancelAnimationFrame(frame);
		channel.port1.close();
		record();
		return seen;
	};
}

function kept(before: ReadonlyArray<Element>, field: HTMLInputElement | HTMLTextAreaElement) {
	for (const element of before) expect(element.isConnected).toBe(true);
	expect(document.activeElement).toBe(field);
	expect(field.value).toBe('typed');
}

async function importedChildMountsInItsOwnRange() {
	await expect.poll(() => textOf('h3'), LOADS).toBe('account 0');
	const [card, head] = [document.querySelector('[data-card]')!, document.querySelector('h3')!];
	const field = focusField();
	click('[data-again]');
	await expect.poll(() => textOf('h3'), LOADS).toBe('account 1');
	expect(textOf('[data-plain]')).toBe('regular account 1');
	kept([card, head], field);
	const painted = paintedStates(() => `${textOf('h3')} | ${textOf('[data-plain]') || textOf('[data-badge-label]')}`);
	click('[data-again]');
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 2');
	expect(textOf('h3')).toBe('account 2');
	expect(document.querySelector('[data-plain]')).toBe(null);
	// The heading and the flipped arm land in one task: no paintable state pairs new with old.
	expect(painted()).toEqual(['account 1 | regular account 1', 'account 2 | account 2']);
	kept([card, head], field);
	// The mounted child runs: its own state answers its own handler.
	click('[data-tap]');
	await expect.poll(() => textOf('[data-tap]')).toBe('1');
	const badge = document.querySelector('[data-badge]')!;
	// A later refresh keeps the mounted child and hands it the new prop.
	click('[data-again]');
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 3');
	expect(document.querySelector('[data-badge]')).toBe(badge);
	expect(textOf('[data-tap]')).toBe('1');
	kept([card, head, badge], field);
}

test('CSR: an @if in a @try arm mounts an imported stateful child in its own range', async () => {
	await render(ImportedChildFlip);
	await importedChildMountsInItsOwnRange();
});

test('SSR: an @if in a @try arm mounts an imported stateful child in its own range after resume', async () => {
	await renderSSR(ImportedChildFlip);
	await importedChildMountsInItsOwnRange();
});

async function pageStateTogglesTheChild() {
	await expect.poll(() => textOf('h2'), LOADS).toBe('account 0');
	const [article, head] = [document.querySelector('article')!, document.querySelector('h2')!];
	const field = focusField();
	click('[data-open]');
	await expect.poll(() => textOf('[data-drawer-title]'), LOADS).toBe('account 0');
	kept([article, head], field);
	click('[data-count]');
	await expect.poll(() => textOf('[data-count]')).toBe('1');
	const drawer = document.querySelector('[data-drawer]')!;
	click('[data-again]');
	await expect.poll(() => textOf('h2'), LOADS).toBe('account 1');
	await expect.poll(() => textOf('[data-drawer-title]'), LOADS).toBe('account 1');
	expect(document.querySelector('[data-drawer]')).toBe(drawer);
	expect(textOf('[data-count]')).toBe('1');
	kept([article, head, drawer], field);
	click('[data-open]');
	await expect.poll(() => document.querySelector('[data-drawer]'), LOADS).toBe(null);
	kept([article, head], field);
	click('[data-open]');
	await expect.poll(() => textOf('[data-drawer-title]'), LOADS).toBe('account 1');
	expect(textOf('[data-count]')).toBe('0');
	kept([article, head], field);
}

test('CSR: page state toggling an @if in a @try arm mounts a same-file stateful child in its own range', async () => {
	await render(StatefulChildToggle);
	await pageStateTogglesTheChild();
});

test('SSR: page state toggling an @if in a @try arm mounts a same-file stateful child after resume', async () => {
	await renderSSR(StatefulChildToggle);
	await pageStateTogglesTheChild();
});

async function servedChildSwitchesInItsOwnRange() {
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 0');
	const [panel, head] = [
		document.querySelector('[data-panel]')!,
		document.querySelector('[data-head]')!,
	];
	const field = focusField();
	click('[data-tap]');
	await expect.poll(() => textOf('[data-tap]')).toBe('1');
	click('[data-again]');
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 1');
	expect(textOf('[data-tap]')).toBe('1');
	kept([panel, head], field);
	click('[data-plain-view]');
	await expect.poll(() => textOf('[data-text]'), LOADS).toBe('plain account 1');
	expect(document.querySelector('[data-badge]')).toBe(null);
	kept([panel, head], field);
	click('[data-again]');
	await expect.poll(() => textOf('[data-text]'), LOADS).toBe('plain account 2');
	await expect.poll(() => textOf('[data-head]'), LOADS).toBe('account 2');
	click('[data-badge-view]');
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 2');
	expect(textOf('[data-tap]')).toBe('0');
	click('[data-tap]');
	await expect.poll(() => textOf('[data-tap]')).toBe('1');
	kept([panel, head], field);
}

test('CSR: a @switch in a @try arm holding an imported child switches only its own range', async () => {
	await render(ServedChildSwitch);
	await servedChildSwitchesInItsOwnRange();
});

test('SSR: a served child in a @try arm @switch switches away and back in its own range after resume', async () => {
	await renderSSR(ServedChildSwitch);
	await servedChildSwitchesInItsOwnRange();
});
