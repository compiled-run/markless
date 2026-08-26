import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { dropOn, fileOf } from '../../test-support/drag.ts';
import Multiple from './scenarios/multiple.tsrx';

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

function fieldNames() {
	return [...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name);
}

test('CSR: with multiple, a second drop adds to the list', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('first.txt'));
	await expect.poll(() => names()).toEqual(['first.txt']);
	dropOn(el('droparea'), fileOf('second.txt'));
	await expect.poll(() => names()).toEqual(['first.txt', 'second.txt']);
	expect(fieldNames()).toEqual(['first.txt', 'second.txt']);
});

test('CSR: one drop of several files becomes several rows', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => names()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	expect(el<HTMLInputElement>('field').multiple).toBe(true);
});

// The same wall the basic suite pins: a repeat over widget-scoped state adds rows
// and never takes one away. The store underneath is right, which is what the row
// below this one measures.
test.fails('CSR: a remove button takes off its own row and leaves the rest', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => names()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	(page.getByTestId('itemclose').elements()[1] as HTMLButtonElement).click();
	await expect.poll(() => names()).toEqual(['a.txt', 'c.txt']);
});

test('CSR: a remove takes its own file off the field and leaves the rest', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => fieldNames()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	(page.getByTestId('itemclose').elements()[1] as HTMLButtonElement).click();
	await expect.poll(() => fieldNames()).toEqual(['a.txt', 'c.txt']);
});

// Two files can share a name, so the row a remove acts on is identified by the id
// minted for it rather than by what it is called.
test('CSR: two files of the same name are told apart by the remove', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('same.txt', 'text/plain', 'first'));
	dropOn(el('droparea'), fileOf('same.txt', 'text/plain', 'second'));
	await expect.poll(() => names()).toEqual(['same.txt', 'same.txt']);
	(page.getByTestId('itemclose').elements()[0] as HTMLButtonElement).click();
	await expect.poll(() => fieldNames()).toEqual(['same.txt']);
	expect([...(el<HTMLInputElement>('field').files ?? [])][0]?.size).toBe(6);
});
