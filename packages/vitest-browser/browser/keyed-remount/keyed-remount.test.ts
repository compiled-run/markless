import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmRows from './krm-arm-rows.tsrx';
import AsyncRekey from './krm-async-rekey.tsrx';
import Generation from './krm-generation.tsrx';
import Rekey from './krm-rekey.tsrx';

afterEach(cleanup);

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];
const texts = (selector: string) => all(selector).map((node) => node.textContent?.trim());
const opens = () => all('[data-seen]').map((node) => node.getAttribute('data-open'));

async function rekeyedRowStartsFresh() {
	expect(texts('[data-tally]')).toEqual(['Alpha:0', 'Beta:0']);
	all<HTMLButtonElement>('[data-tally]')[0]!.click();
	all<HTMLButtonElement>('[data-tally]')[1]!.click();
	await expect.poll(() => texts('[data-tally]')).toEqual(['Alpha:1', 'Beta:1']);
	all<HTMLInputElement>('[data-draft]')[0]!.value = 'left over';
	const [oldFirst, oldSecond] = all('[data-row]');

	(document.querySelector('[data-rekey]') as HTMLElement).click();

	await expect.poll(() => texts('[data-tally]')).toEqual(['Alpha:0', 'Beta:1']);
	const [newFirst, newSecond] = all('[data-row]');
	expect(all('[data-row]')).toHaveLength(2);
	expect(newFirst).not.toBe(oldFirst);
	expect(oldFirst!.isConnected).toBe(false);
	expect(newSecond).toBe(oldSecond);
	expect(all<HTMLInputElement>('[data-draft]')[0]!.value).toBe('');

	// The fresh row answers its own clicks; the kept row keeps counting from where it was.
	all<HTMLButtonElement>('[data-tally]')[0]!.click();
	all<HTMLButtonElement>('[data-tally]')[1]!.click();
	await expect.poll(() => texts('[data-tally]')).toEqual(['Alpha:1', 'Beta:2']);
}

test('CSR: changing a row key renders that row fresh and keeps its neighbours', async () => {
	await render(Rekey);
	await rekeyedRowStartsFresh();
});

test('SSR: changing a row key renders that row fresh and keeps its neighbours', async () => {
	await renderSSR(Rekey);
	await rekeyedRowStartsFresh();
});

async function everyKeyMovesWithTheLap() {
	expect(texts('[data-seen]')).toEqual(['north', 'south', 'east']);
	for (const seen of all<HTMLElement>('[data-seen]')) seen.click();
	await expect.poll(opens).toEqual(['yes', 'yes', 'yes']);
	const before = all('[data-entry]');

	(document.querySelector('[data-lap]') as HTMLElement).click();

	await expect.poll(opens).toEqual(['no', 'no', 'no']);
	expect(texts('[data-seen]')).toEqual(['north', 'south', 'east']);
	expect(all('[data-entry]')).toHaveLength(3);
	for (const entry of before) expect(entry.isConnected).toBe(false);

	all<HTMLElement>('[data-seen]')[1]!.click();
	await expect.poll(opens).toEqual(['no', 'yes', 'no']);
}

test('CSR: a list whose keys all move renders every row fresh', async () => {
	await render(Generation);
	await everyKeyMovesWithTheLap();
});

test('SSR: a list whose keys all move renders every row fresh', async () => {
	await renderSSR(Generation);
	await everyKeyMovesWithTheLap();
});

const pins = () => all('[data-pin]').map((node) => node.getAttribute('data-pinned'));

async function asyncRekeyedRowStartsFresh() {
	await expect.poll(() => texts('[data-pin]')).toEqual(['First', 'Second']);
	for (const pin of all<HTMLElement>('[data-pin]')) pin.click();
	await expect.poll(pins).toEqual(['on', 'on']);
	all<HTMLInputElement>('[data-note]')[0]!.value = 'left over';
	const [oldFirst] = all('[data-hit]');

	(document.querySelector('[data-round]') as HTMLElement).click();

	await expect.poll(pins).toEqual(['off', 'on']);
	const [newFirst] = all('[data-hit]');
	expect(all('[data-hit]')).toHaveLength(2);
	expect(newFirst).not.toBe(oldFirst);
	expect(oldFirst!.isConnected).toBe(false);
	expect(all<HTMLInputElement>('[data-note]')[0]!.value).toBe('');
	all<HTMLElement>('[data-pin]')[0]!.click();
	await expect.poll(pins).toEqual(['on', 'on']);
}

test('CSR: a row whose key changes in an async list renders fresh', async () => {
	await render(AsyncRekey);
	await asyncRekeyedRowStartsFresh();
});

test('SSR: a row whose key changes in an async list renders fresh', async () => {
	await renderSSR(AsyncRekey);
	await asyncRekeyedRowStartsFresh();
});

async function armRowRekeyStartsFresh() {
	expect(texts('[data-arm-row]')).toEqual(['Ex', 'Why']);
	all<HTMLInputElement>('[data-arm-note]')[0]!.value = 'left over';
	all<HTMLInputElement>('[data-arm-note]')[1]!.value = 'kept';
	const [oldFirst, oldSecond] = all('[data-arm-row]');

	(document.querySelector('[data-shift]') as HTMLElement).click();

	await expect.poll(() => all('[data-arm-row]')[0]).not.toBe(oldFirst);
	expect(texts('[data-arm-row]')).toEqual(['Ex', 'Why']);
	expect(oldFirst!.isConnected).toBe(false);
	expect(all('[data-arm-row]')[1]).toBe(oldSecond);
	expect(all<HTMLInputElement>('[data-arm-note]').map((note) => note.value)).toEqual(['', 'kept']);
}

test('CSR: a row whose key changes inside an @if renders fresh', async () => {
	await render(ArmRows);
	await armRowRekeyStartsFresh();
});

test('SSR: a row whose key changes inside an @if renders fresh', async () => {
	await renderSSR(ArmRows);
	await armRowRekeyStartsFresh();
});
