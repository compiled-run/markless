import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, answerEvery, calls, requested, resetCalls } from './gate.ts';
import { listOf, press, settles, textOf } from './support.ts';
import TwoInputs from './two-inputs.tsrx';
import TwoInputsSteps from './two-inputs-steps.tsrx';

afterEach(cleanup);

const shown = () => listOf('section p').join(' | ');

test('CSR: one click that writes two inputs while a run is in flight aborts it and sends one request', async () => {
	resetCalls();
	await render(TwoInputs);
	await settles(() => requested('Austin C')).toBe(1);
	press('Both');
	await settles(() => requested('Denver F')).toBeGreaterThan(0);
	answerEvery('Denver F');
	await settles(() => textOf('section p')).toBe('Denver F sky');
	expect(calls().sort()).toEqual(['Austin C:aborted', 'Denver F:done'].sort());
});

test('CSR: one click that writes two inputs with no run in flight sends one request', async () => {
	resetCalls();
	await render(TwoInputsSteps);
	await settles(() => requested('Austin C') + requested('tide none')).toBe(2);
	answer('Austin C');
	answer('tide none');
	await settles(shown).toBe('Austin C sky | tide none sky');
	press('Both');
	await settles(() => requested('Denver F')).toBe(1);
	answerEvery('Denver F');
	await settles(shown).toBe('Denver F sky | tide none sky');
	expect(calls().sort()).toEqual(['Austin C:done', 'tide none:done', 'Denver F:done'].sort());
});

test('CSR: one click that writes inputs of two async values sends one request for each', async () => {
	resetCalls();
	await render(TwoInputsSteps);
	await settles(() => requested('Austin C') + requested('tide none')).toBe(2);
	answer('Austin C');
	answer('tide none');
	await settles(shown).toBe('Austin C sky | tide none sky');
	press('Each');
	await settles(() => requested('Lima C') + requested('tide high')).toBe(2);
	answerEvery('Lima C');
	answerEvery('tide high');
	await settles(shown).toBe('Lima C sky | tide high sky');
	expect(calls().sort()).toEqual(['Austin C:done', 'tide none:done', 'Lima C:done', 'tide high:done'].sort());
});

test('SSR: after resume, one click that writes two inputs while a run is in flight aborts it and sends one request', async () => {
	resetCalls();
	await renderSSR(TwoInputsSteps);
	expect(shown()).toBe('Austin C sky | tide none sky');
	press('One');
	await settles(() => requested('Boston C')).toBe(1);
	press('Both');
	await settles(() => requested('Denver F')).toBeGreaterThan(0);
	answerEvery('Denver F');
	await settles(shown).toBe('Denver F sky | tide none sky');
	expect(calls().sort()).toEqual(['Boston C:aborted', 'Denver F:done'].sort());
});

test('SSR: after resume, one click that writes inputs of two async values sends one request for each', async () => {
	resetCalls();
	await renderSSR(TwoInputsSteps);
	press('Each');
	await settles(() => requested('Lima C') + requested('tide high')).toBe(2);
	answerEvery('Lima C');
	answerEvery('tide high');
	await settles(shown).toBe('Lima C sky | tide high sky');
	expect(calls().sort()).toEqual(['Lima C:done', 'tide high:done'].sort());
});
