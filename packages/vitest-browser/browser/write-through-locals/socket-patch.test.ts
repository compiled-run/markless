import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import SocketPatchPage from './socket-patch-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
async function expectTracked(): Promise<void> {
	await expect.poll(() => text('[data-received]')).toBe('3');
	await expect.poll(() => text('[data-item="2"]')).toBe('6');
	expect(text('[data-item="1"]')).toBe('0');
	expect(text('[data-item="3"]')).toBe('1');
}

test('CSR: an attach callback patching rows it found by id updates them', async () => {
	await render(SocketPatchPage);
	await expectTracked();
});

test('SSR: an attach callback patching rows it found by id updates them', async () => {
	await renderSSR(SocketPatchPage);
	await expectTracked();
});
