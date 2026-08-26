import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { dropOn, fileOf } from '../../test-support/drag.ts';
import TwoUploads from './scenarios/two-uploads.tsrx';

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

function names(side: string) {
	return page.getByTestId(`${side}-itemlabel`).elements().map((one) => one.textContent);
}

function fieldNames(side: string) {
	return [...(el<HTMLInputElement>(`${side}-field`).files ?? [])].map((one) => one.name);
}

test('CSR: two uploads on one page keep their own files', async () => {
	await render(TwoUploads);
	dropOn(el('left-droparea'), fileOf('left.txt'));
	await expect.poll(() => names('left')).toEqual(['left.txt']);
	expect(names('right')).toEqual([]);
	dropOn(el('right-droparea'), fileOf('right.txt'));
	await expect.poll(() => names('right')).toEqual(['right.txt']);
	expect(names('left')).toEqual(['left.txt']);
	expect(fieldNames('left')).toEqual(['left.txt']);
	expect(fieldNames('right')).toEqual(['right.txt']);
});

test('CSR: two uploads on one page keep their own names and labels', async () => {
	await render(TwoUploads);
	const left = el<HTMLInputElement>('left-field');
	const right = el<HTMLInputElement>('right-field');
	expect(left.name).toBe('left');
	expect(right.name).toBe('right');
	expect(left.id).not.toBe(right.id);
	expect(el<HTMLLabelElement>('left-label').getAttribute('for')).toBe(left.id);
	expect(el<HTMLLabelElement>('right-label').getAttribute('for')).toBe(right.id);
});
