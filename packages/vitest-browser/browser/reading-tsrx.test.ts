import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import { Counter } from './reading-tsrx/body-function.tsrx';
import { Basket } from './reading-tsrx/for-const.tsrx';
import { Note } from './reading-tsrx/statement-container.tsrx';
import { Steps } from './reading-tsrx/for-index.tsrx';
import { Bags } from './reading-tsrx/const-times-state.tsrx';
import { NameCounters } from './reading-tsrx/name-counters.tsrx';
import { ShopPage } from './reading-tsrx/body-function-calls.tsrx';
import { Sizes } from './reading-tsrx/body-map.tsrx';
import { Shelf } from './reading-tsrx/body-value-reads.tsrx';
import { Ledger } from './reading-tsrx/body-value-flow.tsrx';

// The constructs the "Reading a .tsrx file" guide teaches, each served and client-rendered.

afterEach(cleanup);

async function bodyFunction(c: HTMLElement) {
	(c.querySelector('[data-add]') as HTMLButtonElement).click();
	await expect.poll(() => c.querySelector('output')?.textContent).toBe('2');
}

async function forConst(c: HTMLElement) {
	expect(c.querySelector('li')?.textContent).toBe('pear x2');
	expect(c.querySelector('li')?.title).toBe('pear x2');
	(c.querySelector('[data-add]') as HTMLButtonElement).click();
	await expect.poll(() => c.querySelectorAll('li')[1]?.textContent).toBe('fig x5');
	expect(c.querySelectorAll('li')[1]!.title).toBe('fig x5');
	c.querySelectorAll('li')[1]!.click();
	await expect.poll(() => c.querySelector('output')?.textContent).toBe('fig x5');
}

async function statementContainer(c: HTMLElement) {
	const inner = () => c.querySelector('[data-inner]') as HTMLElement;
	expect(inner().textContent).toBe('hello 2');
	expect(inner().title).toBe('hello');
	inner().click();
	await expect.poll(() => inner().textContent).toBe('hello 4');
}

async function forIndex(c: HTMLElement) {
	c.querySelector('button')!.click();
	await expect.poll(() => c.querySelectorAll('li').length).toBe(2);
	expect(c.querySelectorAll('li')[1]!.textContent).toBe('2: more');
}

async function constTimesState(c: HTMLElement) {
	expect(c.querySelector('output')?.textContent).toBe('3');
	c.querySelector('button')!.click();
	await expect.poll(() => c.querySelector('output')?.textContent).toBe('6');
}

async function constantPropText(c: HTMLElement) {
	const button = (name: string) => c.querySelector(`[data-name="${name}"]`) as HTMLButtonElement;
	expect(button('first').textContent).toBe('first 0');
	button('first').click();
	await expect.poll(() => button('first').textContent).toBe('first 1');
	button('second').click();
	await expect.poll(() => button('second').textContent).toBe('second 1');
	expect(button('first').textContent).toBe('first 1');
}

async function bodyFunctionCalls(c: HTMLElement) {
	const click = (selector: string) => (c.querySelector(selector) as HTMLButtonElement).click();
	const total = () => c.querySelector('[data-total]')?.textContent;
	const last = () => c.querySelector('[data-last]')?.textContent;
	click('[data-add]');
	await expect.poll(total).toBe('6');
	expect(last()).toBe('added 2');
	click('[data-bonus]');
	await expect.poll(total).toBe('36');
	expect(last()).toBe('added 10');
	click('[data-fruit="fig"]');
	await expect.poll(last).toBe('fig');
	click('[data-choose]');
	await expect.poll(total).toBe('45');
	expect(last()).toBe('added 3');
}

test('CSR: onClick names a function declared in the body', async () =>
	bodyFunction((await render(Counter)).container as HTMLElement));
test('SSR: onClick names a function declared in the body', async () =>
	bodyFunction((await renderSSR(Counter)).container as HTMLElement));
test('CSR: a const at the top of an @for body renders in served and added rows', async () =>
	forConst((await render(Basket)).container as HTMLElement));
test('SSR: a const at the top of an @for body renders in served and added rows', async () =>
	forConst((await renderSSR(Basket)).container as HTMLElement));
test('CSR: a nested @{ } among elements renders its node from its own consts', async () =>
	statementContainer((await render(Note)).container as HTMLElement));
test('SSR: a nested @{ } among elements renders its node from its own consts', async () =>
	statementContainer((await renderSSR(Note)).container as HTMLElement));
test('CSR: an @for with an index clause keeps numbering added rows', async () =>
	forIndex((await render(Steps)).container as HTMLElement));
test('SSR: an @for with an index clause keeps numbering added rows', async () =>
	forIndex((await renderSSR(Steps)).container as HTMLElement));
test('CSR: state times a body const stays current', async () =>
	constTimesState((await render(Bags)).container as HTMLElement));
test('SSR: state times a body const stays current', async () =>
	constTimesState((await renderSSR(Bags)).container as HTMLElement));
test('CSR: an imported child joining a constant prop with state keeps the prop', async () =>
	constantPropText((await render(NameCounters)).container as HTMLElement));
test('SSR: an imported child joining a constant prop with state keeps the prop', async () =>
	constantPropText((await renderSSR(NameCounters)).container as HTMLElement));
test('CSR: handlers call body functions with arguments, from rows and callback props', async () =>
	bodyFunctionCalls((await render(ShopPage)).container as HTMLElement));
test('SSR: handlers call body functions with arguments, from rows and callback props', async () =>
	bodyFunctionCalls((await renderSSR(ShopPage)).container as HTMLElement));

async function bodyMap(c: HTMLElement) {
	const text = (selector: string) => c.querySelector(selector)?.textContent;
	expect(text('[data-label]')).toBe('small');
	(c.querySelector('[data-grow]') as HTMLButtonElement).click();
	await expect.poll(() => text('[data-label]')).toBe('medium');
	(c.querySelector('[data-pick]') as HTMLButtonElement).click();
	await expect.poll(() => text('[data-picked]')).toBe('medium');
}

test('CSR: a handler, a body function and a computed read a body Map', async () =>
	bodyMap((await render(Sizes)).container as HTMLElement));
test('SSR: a handler, a body function and a computed read a body Map', async () =>
	bodyMap((await renderSSR(Sizes)).container as HTMLElement));

async function bodyValueReads(c: HTMLElement) {
	const shown = () => c.querySelector('output')?.textContent;
	(c.querySelector('[data-sort]') as HTMLButtonElement).click();
	await expect.poll(shown).toBe('1,2,3');
	(c.querySelector('[data-describe]') as HTMLButtonElement).click();
	await expect.poll(shown).toBe('shelf:true:two:6');
	(c.querySelector('[data-sort]') as HTMLButtonElement).click();
	await expect.poll(shown).toBe('1,2,3');
}

test('CSR: a handler reading body values through methods that only read them', async () =>
	bodyValueReads((await render(Shelf)).container as HTMLElement));
test('SSR: a handler reading body values through methods that only read them', async () =>
	bodyValueReads((await renderSSR(Shelf)).container as HTMLElement));

// Every click rebuilds the body values, so reads through other names and helpers see them unchanged.
async function bodyValueFlow(c: HTMLElement) {
	const shown = () => c.querySelector('output')?.textContent;
	for (let run = 0; run < 2; run++) {
		(c.querySelector('[data-alias]') as HTMLButtonElement).click();
		await expect.poll(shown).toBe('desk:ab:pens:3');
		(c.querySelector('[data-helpers]') as HTMLButtonElement).click();
		await expect.poll(shown).toBe('5:DESK/2');
		(c.querySelector('[data-copy]') as HTMLButtonElement).click();
		await expect.poll(shown).toBe('INK,PENS,END');
	}
}

test('CSR: a handler reads body values through aliases, destructuring and helpers, imported ones too', async () =>
	bodyValueFlow((await render(Ledger)).container as HTMLElement));
test('SSR: a handler reads body values through aliases, destructuring and helpers, imported ones too', async () =>
	bodyValueFlow((await renderSSR(Ledger)).container as HTMLElement));
