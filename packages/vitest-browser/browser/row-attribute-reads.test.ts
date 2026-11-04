import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import LocalComputed from './row-attribute-reads/local-computed.tsrx';
import PropComputed from './row-attribute-reads/prop-computed.tsrx';
import PropDirect from './row-attribute-reads/prop-direct.tsrx';
import RootComputed from './row-attribute-reads/root-computed.tsrx';
import SharedChild from './row-attribute-reads/shared-child.tsrx';
import SharedChildRead from './row-attribute-reads/shared-child-read.tsrx';
import SharedRoot from './row-attribute-reads/shared-root.tsrx';
import WidgetRows from './row-attribute-reads/widget-rows-page.tsrx';
import WidgetPair from './row-attribute-reads/widget-pair-page.tsrx';
import WidgetPart from './row-attribute-reads/widget-part-page.tsrx';

// Every row repaints when the value its attribute reads changes, not only the clicked one.

afterEach(cleanup);

const checked = () =>
	[...document.querySelectorAll('[data-item]')].map(
		(row) => `${row.getAttribute('data-item')}:${row.getAttribute('data-checked')}`,
	);
const click = (name: string) =>
	document.querySelector<HTMLElement>(`[data-item="${name}"]`)!.click();

async function everyRowRepaints() {
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	click('nova');
	await expect.poll(checked).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	click('lyra');
	await expect.poll(checked).toEqual(['lyra:true', 'maia:false', 'nova:false']);
}

test('CSR: child rows whose attribute reads a prop', async () => {
	await render(PropDirect);
	await everyRowRepaints();
});

test('SSR: child rows whose attribute reads a prop', async () => {
	await renderSSR(PropDirect);
	await everyRowRepaints();
});

test('CSR: child rows whose attribute reads a computed of a prop', async () => {
	await render(PropComputed);
	await everyRowRepaints();
});

test('SSR: child rows whose attribute reads a computed of a prop', async () => {
	await renderSSR(PropComputed);
	await everyRowRepaints();
});

test('CSR: child rows whose attribute reads a computed of their own state', async () => {
	await render(LocalComputed);
	await everyRowRepaints();
});

test('SSR: child rows whose attribute reads a computed of their own state', async () => {
	await renderSSR(LocalComputed);
	await everyRowRepaints();
});

test('CSR: page rows whose attribute reads a computed', async () => {
	await render(RootComputed);
	await everyRowRepaints();
});

test('SSR: page rows whose attribute reads a computed', async () => {
	await renderSSR(RootComputed);
	await everyRowRepaints();
});

test('CSR: page rows whose attribute reads shared() state', async () => {
	await render(SharedRoot);
	await everyRowRepaints();
});

test('SSR: page rows whose attribute reads shared() state', async () => {
	await renderSSR(SharedRoot);
	await everyRowRepaints();
});

test('CSR: child rows whose attribute reads shared() state', async () => {
	await render(SharedChildRead);
	await everyRowRepaints();
});

test('SSR: child rows whose attribute reads shared() state', async () => {
	await renderSSR(SharedChildRead);
	await everyRowRepaints();
});

test('CSR: child rows whose attribute reads a computed of shared() state', async () => {
	await render(SharedChild);
	await everyRowRepaints();
});

test('SSR: child rows whose attribute reads a computed of shared() state', async () => {
	await renderSSR(SharedChild);
	await everyRowRepaints();
});

test('CSR: widget rows whose attribute reads widget-scoped shared() state', async () => {
	await render(WidgetRows);
	await everyRowRepaints();
});

test('SSR: widget rows whose attribute reads widget-scoped shared() state', async () => {
	await renderSSR(WidgetRows);
	await everyRowRepaints();
});

test('CSR: rows in a part projected into a widget root read the root\'s widget-scoped shared() state', async () => {
	await render(WidgetPart);
	await everyRowRepaints();
	expect(document.querySelector('[data-deck]')!.getAttribute('data-face')).toBe('lyra');
});

test('SSR: rows in a part projected into a widget root read the root\'s widget-scoped shared() state', async () => {
	await renderSSR(WidgetPart);
	await everyRowRepaints();
	expect(document.querySelector('[data-deck]')!.getAttribute('data-face')).toBe('lyra');
});

const checkedIn = (section: string) =>
	[...document.querySelectorAll(`[${section}] [data-item]`)].map(
		(row) => `${row.getAttribute('data-item')}:${row.getAttribute('data-checked')}`,
	);

// Each rendered widget holds its own shared() instance, so a pick in one leaves the other alone.
async function widgetsRepaintApart() {
	const rows = (on: string) => ['lyra', 'maia', 'nova'].map((name) => `${name}:${name === on}`);
	expect([checkedIn('data-first'), checkedIn('data-second')]).toEqual([rows('maia'), rows('maia')]);
	document.querySelector<HTMLElement>('[data-first] [data-item="nova"]')!.click();
	await expect.poll(() => checkedIn('data-first')).toEqual(rows('nova'));
	expect(checkedIn('data-second')).toEqual(rows('maia'));
	document.querySelector<HTMLElement>('[data-second] [data-item="lyra"]')!.click();
	await expect.poll(() => checkedIn('data-second')).toEqual(rows('lyra'));
	expect(checkedIn('data-first')).toEqual(rows('nova'));
}

test('CSR: two widgets\' rows each follow their own widget-scoped shared() state', async () => {
	await render(WidgetPair);
	await widgetsRepaintApart();
});

test('SSR: two widgets\' rows each follow their own widget-scoped shared() state', async () => {
	await renderSSR(WidgetPair);
	await widgetsRepaintApart();
});
