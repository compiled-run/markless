import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Lanes from './nr-lanes.tsrx';
import Three from './nr-three.tsrx';
import TryArm from './nr-try.tsrx';
import FlatTry from './nr-try-flat.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const at = (selector: string) => document.querySelector<HTMLElement>(selector)!;

// The lane row is rebuilt by the write; its cards mint after it, and focus follows them there.
async function pinFocusFollowsTheRebuiltRow() {
	await userEvent.click(at('[data-card="k2"] .vote'));
	await expect.poll(() => text('[data-voted]')).toBe('k2');
	await expect.poll(() => text('[data-lane="l1"] b')).toBe('1');
	await expect.poll(() => document.activeElement).toBe(at('[data-card="k2"] .vote'));
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => text('[data-card="k2"] .vote')).toBe('2');
	expect(text('[data-lane="l1"] b')).toBe('2');
	await expect.poll(() => document.activeElement).toBe(at('[data-card="k2"] .vote'));
}

test('CSR: focus lands in the inner row after its enclosing row is rebuilt', async () => {
	await render(Lanes);
	await pinFocusFollowsTheRebuiltRow();
});

test('SSR: focus lands in the inner row after its enclosing row is rebuilt', async () => {
	await renderSSR(Lanes);
	await pinFocusFollowsTheRebuiltRow();
});

async function pinTryArm() {
	await expect.poll(() => document.querySelectorAll('[data-member]').length).toBe(3);
	at('[data-member="m3"]').click();
	await expect.poll(() => text('[data-voted]')).toBe('m3');
	at('[data-member="m1"]').click();
	await expect.poll(() => text('[data-voted]')).toBe('m1');
	at('[data-member="m2"]').click();
	await expect.poll(() => text('[data-voted]')).toBe('m2');
}

test('CSR: nested rows inside a settled @try arm dispatch their own handlers', async () => {
	await render(TryArm);
	await pinTryArm();
});

test('SSR: nested rows inside a settled @try arm dispatch their own handlers', async () => {
	await renderSSR(TryArm);
	await pinTryArm();
});

test('CSR: rows inside a settled @try arm dispatch their own handlers', async () => {
	await render(FlatTry);
	await pinTryArm();
});

test('SSR: rows inside a settled @try arm dispatch their own handlers', async () => {
	await renderSSR(FlatTry);
	await pinTryArm();
});

async function pinThreeLevels() {
	at('[data-card="c"]').click();
	await expect.poll(() => text('[data-last]')).toBe('c');
	await expect.poll(() => text('[data-card="c"]')).toBe('1');
	expect(text('[data-lane="n2"] h3')).toBe('1');
	expect(text('[data-region="north"] h2')).toBe('1');
	at('[data-card="d"]').click();
	await expect.poll(() => text('[data-region="south"] h2')).toBe('1');
	at('[data-card="a"]').click();
	await expect.poll(() => text('[data-region="north"] h2')).toBe('2');
	expect(text('[data-lane="n1"] h3')).toBe('1');
	at('[data-add]').click();
	await expect.poll(() => document.querySelectorAll('[data-card="e"]').length).toBe(1);
	at('[data-card="e"]').click();
	await expect.poll(() => text('[data-region="east"] h2')).toBe('1');
	expect(text('[data-last]')).toBe('e');
}

test('CSR: a handler three rows deep writes every enclosing row', async () => {
	await render(Three);
	await pinThreeLevels();
});

test('SSR: a handler three rows deep writes every enclosing row', async () => {
	await renderSSR(Three);
	await pinThreeLevels();
});

