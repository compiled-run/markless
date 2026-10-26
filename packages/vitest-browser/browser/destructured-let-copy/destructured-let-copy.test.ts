import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import DestructuredLet from './destructured-let-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function aReassignedCopyLeavesStateAlone() {
	press('[data-copy]');
	await expect.poll(() => text('[data-local]')).toBe('11 x!');
	await new Promise((done) => setTimeout(done, 50));
	expect([text('[data-b]'), text('[data-tags]')]).toEqual(['10', 'x']);

	press('[data-through]');
	await expect.poll(() => text('[data-tags]')).toBe('x,y');
	press('[data-source]');
	await expect.poll(() => text('[data-a]')).toBe('2');
}

test('CSR: a reassigned let destructured from state is a copy, as in JavaScript', async () => {
	await render(DestructuredLet);
	await aReassignedCopyLeavesStateAlone();
});

test('SSR: a reassigned let destructured from state is a copy, as in JavaScript', async () => {
	await renderSSR(DestructuredLet);
	await aReassignedCopyLeavesStateAlone();
});
