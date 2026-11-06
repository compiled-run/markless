import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Depth1 from './depth-1.tsrx';
import Depth2 from './depth-2.tsrx';
import Depth3 from './depth-3.tsrx';

// A row a keyed @for builds inside a component that was itself built in the browser keeps its prop, its row item and
// its own state in its click handlers.
afterEach(() => cleanup());

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function rowHandlersRead(id: string) {
	const row = `[data-item="${id}"]`;
	click(`${row} .open`);
	await expect.poll(() => text(`${row} .opened`)).toBe(id);
	click(`${row} .pick`);
	await expect.poll(() => text('.picked')).toBe(id);
	click(`${row} .bump`);
	click(`${row} .bump`);
	click(`${row} .save`);
	await expect.poll(() => text(`${row} .saved`)).toBe(`${id}:2`);
}

async function rowsKeepTheirValues() {
	await rowHandlersRead('ada');
	click('.add');
	await expect.poll(() => text('[data-item="n1"] .opened')).toBe('');
	await rowHandlersRead('n1');
	for (let restart = 0; restart < 3; restart++) {
		click('#restart');
		await expect.poll(() => text('[data-item="ada"] .opened')).toBe('');
		await rowHandlersRead('ada');
		click('.add');
		await expect.poll(() => text('[data-item="n1"] .opened')).toBe('');
		await rowHandlersRead('n1');
		click('.add');
		await expect.poll(() => text('[data-item="n2"] .opened')).toBe('');
		await rowHandlersRead('n2');
	}
}

test('CSR: rows under a browser-built component 1 deep read their prop, item and state in handlers', async () => {
	await render(Depth1);
	await rowsKeepTheirValues();
});

test('SSR: rows under a browser-built component 1 deep read their prop, item and state in handlers after resume', async () => {
	await renderSSR(Depth1);
	await rowsKeepTheirValues();
});

test('CSR: rows under a browser-built component 2 deep read their prop, item and state in handlers', async () => {
	await render(Depth2);
	await rowsKeepTheirValues();
});

test('SSR: rows under a browser-built component 2 deep read their prop, item and state in handlers after resume', async () => {
	await renderSSR(Depth2);
	await rowsKeepTheirValues();
});

test('CSR: rows under a browser-built component 3 deep read their prop, item and state in handlers', async () => {
	await render(Depth3);
	await rowsKeepTheirValues();
});

test('SSR: rows under a browser-built component 3 deep read their prop, item and state in handlers after resume', async () => {
	await renderSSR(Depth3);
	await rowsKeepTheirValues();
});
