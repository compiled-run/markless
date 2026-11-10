import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedWrapper from './imported-wrapper.tsrx';
import OneWrapper from './one-wrapper.tsrx';
import TwoWrappers from './two-wrappers.tsrx';

afterEach(() => cleanup());

const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';

function type(value: string) {
	const input = document.querySelector('[data-text]') as HTMLInputElement;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function press(name: string, value: string) {
	type(value);
	await expect.poll(() => textOf('[data-text-shown]')).toBe(value);
	(document.querySelector(`[data-press="${name}"]`) as HTMLButtonElement).click();
	await expect.poll(() => textOf('[data-text-shown]')).toBe('');
}

async function namedHandlersWriteState() {
	await press('add', ' ink ');
	await expect.poll(() => textOf('[data-drafts]')).toBe('ink');
	await press('shout', 'pen');
	await expect.poll(() => textOf('[data-drafts]')).toBe('ink,PEN');
	await press('later', 'nib');
	await expect.poll(() => textOf('[data-drafts]')).toBe('ink,PEN,nib!');
	expect((document.querySelector('[data-text]') as HTMLInputElement).value).toBe('');
}

test('CSR: named arrow, function and async handlers passed through one wrapper write state', async () => {
	await render(OneWrapper);
	await namedHandlersWriteState();
});

test('SSR: named arrow, function and async handlers passed through one wrapper write state after resume', async () => {
	await renderSSR(OneWrapper);
	await namedHandlersWriteState();
});

test('CSR: named arrow, function and async handlers passed through two wrappers write state', async () => {
	await render(TwoWrappers);
	await namedHandlersWriteState();
});

test('SSR: named arrow, function and async handlers passed through two wrappers write state after resume', async () => {
	await renderSSR(TwoWrappers);
	await namedHandlersWriteState();
});

test('CSR: named arrow, function and async handlers passed through an imported wrapper write state', async () => {
	await render(ImportedWrapper);
	await namedHandlersWriteState();
});

test('SSR: named arrow, function and async handlers passed through an imported wrapper write state after resume', async () => {
	await renderSSR(ImportedWrapper);
	await namedHandlersWriteState();
});
