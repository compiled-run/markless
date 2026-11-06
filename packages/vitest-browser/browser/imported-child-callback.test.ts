import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ImportedClickPage from './imported-child-callback/imported-click.tsrx';
import ImportedSpreadPage from './imported-child-callback/imported-spread.tsrx';
import ImportedTimerPage from './imported-child-callback/imported-timer.tsrx';
import ImportedTwoWrappersPage from './imported-child-callback/imported-two-wrappers.tsrx';
import SameFilePage from './imported-child-callback/same-file.tsrx';

// A callback prop handed to a component imported from another module runs when that component calls it,
// even when the child's own module also forwards that prop under another name.
afterEach(() => cleanup());

const count = (root: ParentNode) => root.querySelector('[data-count]')?.textContent;

async function press(root: ParentNode, trigger: string, expected: string) {
	root.querySelector<HTMLElement>(trigger)!.click();
	await expect.poll(() => count(root)).toBe(expected);
}

async function twice(root: ParentNode, trigger: string) {
	expect(count(root)).toBe('0');
	await press(root, trigger, '1');
	await press(root, trigger, '2');
}

async function sameFile(root: ParentNode) {
	await press(root, '[data-click]', '1');
	await press(root, '[data-timer]', '3');
}

test('CSR: an imported child calls the prop from its click handler', async () => {
	await twice((await render(ImportedClickPage)).container, '[data-click]');
});

test('SSR: an imported child calls the prop from its click handler', async () => {
	await twice((await renderSSR(ImportedClickPage)).container, '[data-click]');
});

test('CSR: an imported child calls the prop from a timer', async () => {
	await twice((await render(ImportedTimerPage)).container, '[data-timer]');
});

test('SSR: an imported child calls the prop from a timer', async () => {
	await twice((await renderSSR(ImportedTimerPage)).container, '[data-timer]');
});

test('CSR: an imported wrapper spreads the prop onto an imported child', async () => {
	await twice((await render(ImportedSpreadPage)).container, '[data-click]');
});

test('SSR: an imported wrapper spreads the prop onto an imported child', async () => {
	await twice((await renderSSR(ImportedSpreadPage)).container, '[data-click]');
});

test('CSR: the prop passes through two imported wrappers', async () => {
	await twice((await render(ImportedTwoWrappersPage)).container, '[data-click]');
});

test('SSR: the prop passes through two imported wrappers', async () => {
	await twice((await renderSSR(ImportedTwoWrappersPage)).container, '[data-click]');
});

test('CSR: same-file children call the prop from a click and from a timer', async () => {
	await sameFile((await render(SameFilePage)).container);
});

test('SSR: same-file children call the prop from a click and from a timer', async () => {
	await sameFile((await renderSSR(SameFilePage)).container);
});
