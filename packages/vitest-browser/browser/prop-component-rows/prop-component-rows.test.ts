import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedRowsPage from './pcr-imported-page.tsrx';
import Page from './pcr-page.tsrx';

afterEach(cleanup);

const rows = (selector: string) =>
	[...document.querySelectorAll(`${selector} li`)].map((item) => item.textContent);

async function pinRowsFollowTheProp() {
	document.querySelector<HTMLElement>('[data-add-title]')!.click();
	await expect.poll(() => rows('[data-prop-rows]')).toEqual(['X', 'e1']);
	await expect.poll(() => rows('[data-local-rows]')).toEqual(['X', 'e1']);
	await expect.poll(() => rows('[data-computed-rows]')).toEqual(['X', 'E1']);
}

test('CSR: component rows over a prop add the row the page wrote', async () => {
	await render(Page);
	await pinRowsFollowTheProp();
});

test('SSR: component rows over a prop add the row the page wrote', async () => {
	await renderSSR(Page);
	await pinRowsFollowTheProp();
});

async function pinImportedComponentRows() {
	document.querySelector<HTMLElement>('[data-add-title]')!.click();
	await expect.poll(() => rows('[data-slot-rows]')).toEqual(['X', 'e1']);
	await expect.poll(() => rows('[data-prop-rows]')).toEqual(['X', 'e1']);
}

test('CSR: imported component rows still build beside the page module own expression rows', async () => {
	await render(ImportedRowsPage);
	await pinImportedComponentRows();
});

test('SSR: imported component rows still build beside the page module own expression rows', async () => {
	await renderSSR(ImportedRowsPage);
	await pinImportedComponentRows();
});
