import { afterEach, beforeEach, expect, test } from 'vitest';
import { marklessReportLocatorMiss } from '../../../web/src/fns/locator-miss.ts';
import { marklessScalarLocate } from '../../../web/src/fns/scalar-served.ts';

const roots: Element[] = [];
const messages: string[] = [];
const reportError = globalThis.reportError;

beforeEach(() => {
	messages.length = 0;
	globalThis.reportError = (error: unknown) => {
		messages.push(String((error as Error).message));
	};
});
afterEach(() => {
	globalThis.reportError = reportError;
	for (const root of roots.splice(0)) root.remove();
});

function page(html: string): Element {
	const root = document.createElement('div');
	root.innerHTML = html;
	document.body.append(root);
	roots.push(root);
	return root;
}

const settle = () => new Promise((done) => setTimeout(done, 50));

test('in dev, a lean lookup that finds no element where a locator points reports it once', async () => {
	const root = page('<main><p>a</p><button>b</button></main>');
	expect(marklessScalarLocate(root, 'h6', 6, 'button')).toBe(null);
	expect(marklessScalarLocate(root, 'h6', 6, 'button')).toBe(null);
	await expect.poll(() => messages).toEqual([
		expect.stringContaining('Resume locator h6 expected <button> at DOM order index 6.'),
	]);
	await settle();
	expect(messages).toHaveLength(1);
});

test('in dev, a lean lookup that finds another tag where a locator points reports what it found', async () => {
	const root = page('<main><p>a</p><button>b</button></main>');
	expect(marklessScalarLocate(root, 'h2', 2, 'button')).toBe(null);
	await expect.poll(() => messages).toEqual([
		expect.stringContaining(
			'Resume locator h2 expected <button> at DOM order index 2 but found <p>.',
		),
	]);
});

test('a miss reported without an index reads it from the served view', () => {
	const root = page(
		'<main><p>a</p></main><script type="markless/view">{"locators":[{"hostNodeId":"h1","index":1,"tagName":"button"}]}</script>',
	);
	marklessReportLocatorMiss(root, { hostNodeId: 'h1', tagName: 'button' }, root.querySelector('main'));
	expect(messages).toEqual([
		expect.stringContaining(
			'Resume locator h1 expected <button> at DOM order index 1 but found <main>.',
		),
	]);
});

test('a slot the census repair emptied is left to the full resume report', () => {
	const root = page('<main></main>');
	marklessReportLocatorMiss(root, { hostNodeId: 'h1', tagName: 'button', index: 1 }, null);
	expect(messages).toEqual([]);
});

test('a lookup that lands on its element reports nothing', async () => {
	const root = page('<main><p>a</p><button>b</button></main>');
	expect(marklessScalarLocate(root, 'h3', 3, 'button')?.textContent).toBe('b');
	await settle();
	expect(messages).toEqual([]);
});
