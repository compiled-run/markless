import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { dropOn, fileOf } from '../../test-support/drag.ts';
import Accept from './scenarios/accept.tsrx';

// Its own file: a compiled page installs its row-minting loader into a single
// unqualified global, so two scenarios with a repeat cannot share one suite.

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

function names() {
	return page.getByTestId('itemlabel').elements().map((one) => one.textContent);
}

test('CSR: the accept list is on the field the picker opens from', async () => {
	await render(Accept);
	expect(el<HTMLInputElement>('field').accept).toBe('image/*');
});

// The browser applies accept to the picker and never to a drop, so without the
// family filtering it a dropped text file would land in an images-only upload.
test('CSR: a dropped file the accept list rejects never arrives', async () => {
	await render(Accept);
	dropOn(el('droparea'), fileOf('notes.txt', 'text/plain'));
	dropOn(el('droparea'), fileOf('photo.png', 'image/png'));
	await expect.poll(() => names()).toEqual(['photo.png']);
	expect([...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name)).toEqual([
		'photo.png',
	]);
});

test('CSR: one drop keeps what the accept list allows and drops the rest', async () => {
	await render(Accept);
	dropOn(el('droparea'), fileOf('a.png', 'image/png'), fileOf('b.pdf', 'application/pdf'));
	await expect.poll(() => names()).toEqual(['a.png']);
});
