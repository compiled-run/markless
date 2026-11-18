import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests, saved } from './gate.ts';
import NamedState from './named-state.tsrx';
import ReportNamed from './report-named.tsrx';
import ReportSave from './report-save.tsrx';

afterEach(() => {
	cleanup();
	forgetRequests();
	saved.length = 0;
});

const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';

async function firstReport() {
	await expect.poll(() => asked('report:7')).toBe(true);
	answer('report:7');
}

async function savesThroughInlineLocals() {
	await expect.poll(() => textOf('[data-report]')).toBe('70');
	click('[data-save]');
	await expect.poll(() => saved).toEqual([7]);
	click('[data-share]');
	await expect.poll(() => saved).toEqual([7, '70/7']);
}

test('CSR: an inline handler copies the async value into a local before reading it', async () => {
	await render(ReportSave);
	await firstReport();
	await savesThroughInlineLocals();
});

test('SSR: an inline handler copies the async value into a local before reading it after resume', async () => {
	await renderSSR(ReportSave);
	await savesThroughInlineLocals();
});

async function savesThroughNamedHandlers() {
	await expect.poll(() => textOf('[data-report]')).toBe('Total: 70 over 7 days');
	click('[data-save]');
	await expect.poll(() => saved).toEqual([{ days: 7, total: 70 }]);
	await expect.poll(() => (document.querySelector('[data-save]') as HTMLButtonElement).disabled).toBe(false);
	click('[data-share]');
	await expect.poll(() => saved).toEqual([{ days: 7, total: 70 }, '70/7']);
}

test('CSR: handlers named by a body arrow and a body function read the async value', async () => {
	await render(ReportNamed);
	await firstReport();
	await savesThroughNamedHandlers();
});

test('SSR: handlers named by a body arrow and a body function read the async value after resume', async () => {
	await renderSSR(ReportNamed);
	await savesThroughNamedHandlers();
});

async function namedHandlersReadState() {
	click('button:nth-of-type(2)');
	await expect.poll(() => textOf('p')).toBe('1');
	click('button:nth-of-type(1)');
	await expect.poll(() => saved).toEqual([1]);
}

test('CSR: handlers named by body functions read plain state', async () => {
	await render(NamedState);
	await namedHandlersReadState();
});

test('SSR: handlers named by body functions read plain state after resume', async () => {
	await renderSSR(NamedState);
	await namedHandlersReadState();
});
