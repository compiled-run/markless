import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { resolveFiles } from './files.ts';
import IdleFilled from './idle-filled.tsrx';

// A row added after load repaints its own state in a text read that falls back to a prop, beside an input bound to another row state.

afterEach(cleanup);

const WAIT = { timeout: 3_000 };
const row = () => document.querySelector<HTMLElement>('[data-file]')!;

async function typeThenRename() {
	await expect.poll(() => resolveFiles([{ id: 1, name: 'Plan' }]), WAIT).toBe(true);
	await expect.poll(() => document.querySelectorAll('[data-file]').length, WAIT).toBe(1);
	expect(row().querySelector('[data-name]')!.textContent).toBe('Plan');
	await userEvent.fill(row().querySelector<HTMLInputElement>('[data-typed]')!, 'Plan v2');
	await userEvent.click(row().querySelector<HTMLElement>('[data-rename]')!);
	await expect.poll(() => row().querySelector('[data-name]')!.textContent, WAIT).toBe('Clicked');
	expect(row().querySelector<HTMLInputElement>('[data-typed]')!.value).toBe('Plan v2');
}

test('CSR: a row an onIdle write adds shows its own state write after its input is typed into', async () => {
	await render(IdleFilled);
	await typeThenRename();
});

test('SSR: a row an onIdle write adds after resume shows its own state write after its input is typed into', async () => {
	await renderSSR(IdleFilled);
	await typeThenRename();
});
