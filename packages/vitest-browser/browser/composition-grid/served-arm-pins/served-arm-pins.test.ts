import { expect, test } from 'vitest';
import { render, renderSSR } from '../../../src/index.ts';
import AsyncCaseConst from './async-case-const.tsrx';
import AsyncIfConst from './async-if-const.tsrx';
import TestOnlyArms from './test-only-arms.tsrx';
import TestOnlyElements from './test-only-elements.tsrx';

// A @try whose arms each hold the same component with a different constant prop, client- and server-rendered.
const shown = () => document.querySelector('[data-r]')?.textContent?.trim();

test('CSR: a @switch (true) shows the default arm with its own constant prop', async () => {
	await render(AsyncCaseConst);
	await expect.poll(shown).toBe('tag even');
});

test('SSR: an @if shows the else arm with its own constant prop', async () => {
	await renderSSR(AsyncIfConst);
	await expect.poll(shown).toBe('tag even');
});

test('SSR: a @switch (true) shows the default arm with its own constant prop', async () => {
	await renderSSR(AsyncCaseConst);
	await expect.poll(shown).toBe('tag even');
});

test('CSR: a @try whose value only an @if test reads shows its plain-element arm', async () => {
	await render(TestOnlyElements);
	await expect.poll(shown).toBe('tag even');
});

// Known defect: when the @if test is the only reader of the @try's async value and each arm holds only a component
// with constant props, the boundary stays on @pending after the value answers.
test.fails('CSR: a @try whose value only an @if test reads shows its component arm', async () => {
	await render(TestOnlyArms);
	await expect.poll(shown).toBe('tag even');
});

test.fails('SSR: a @try whose value only an @if test reads shows its component arm', async () => {
	await renderSSR(TestOnlyArms);
	await expect.poll(shown).toBe('tag even');
});
