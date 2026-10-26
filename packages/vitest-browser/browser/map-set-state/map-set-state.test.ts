import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { AsyncKeyPage } from './async-key-page.tsrx';
import { KeyedValuesPage } from './keyed-values-page.tsrx';
import { MapPage } from './map-page.tsrx';
import { SetPage } from './set-page.tsrx';

afterEach(() => cleanup());

function kit(container: ParentNode) {
	const text = (selector: string) => container.querySelector(selector)?.textContent ?? null;
	const press = (selector: string) => {
		const element = container.querySelector<HTMLElement>(selector);
		if (!element) throw new Error(`Expected ${selector}.`);
		element.click();
	};
	const shows = (selector: string, value: string) =>
		expect.poll(() => text(selector), { message: selector }).toBe(value);
	return { press, shows };
}

async function mapUpdates(container: HTMLElement) {
	const { press, shows } = kit(container);
	await shows('[data-v]', '1');
	await shows('[data-size]', '1');
	await shows('[data-has]', 'no');
	press('[data-set]');
	await shows('[data-v]', '2');
	press('[data-add]');
	await shows('[data-v]', '5');
	await shows('[data-size]', '2');
	await shows('[data-has]', 'yes');
	press('[data-del]');
	await shows('[data-v]', 'none');
	await shows('[data-size]', '1');
	press('[data-clear]');
	await shows('[data-size]', '0');
	await shows('[data-has]', 'no');
}

test('browser render: a Map in state reads, sets, adds, deletes and clears', async () => {
	await mapUpdates((await render(MapPage)).container as HTMLElement);
});

test('server render + resume: a Map in state reads, sets, adds, deletes and clears', async () => {
	await mapUpdates((await renderSSR(MapPage)).container as HTMLElement);
});

async function setUpdates(container: HTMLElement) {
	const { press, shows } = kit(container);
	await shows('[data-list]', 'x');
	await shows('[data-has]', 'no');
	press('[data-add]');
	await shows('[data-list]', 'x,y');
	await shows('[data-has]', 'yes');
	await shows('[data-size]', '2');
	press('[data-del]');
	await shows('[data-list]', 'y');
	press('[data-clear]');
	await shows('[data-list]', '');
	await shows('[data-size]', '0');
}

test('browser render: a Set in state and in a computed adds, deletes and clears', async () => {
	await setUpdates((await render(SetPage)).container as HTMLElement);
});

test('server render + resume: a Set in state and in a computed adds, deletes and clears', async () => {
	await setUpdates((await renderSSR(SetPage)).container as HTMLElement);
});

async function keyedValuesUpdate(container: HTMLElement) {
	const { press, shows } = kit(container);
	await shows('[data-total]', '1');
	await shows('[data-label]', 'three');
	await shows('[data-days]', '7+9');
	await shows('[data-year]', '2026');
	press('[data-put]');
	await shows('[data-total]', '11');
	press('[data-day]');
	await shows('[data-days]', '7+9+11');
}

test('browser render: number keys, object values and a Set nested in an object survive', async () => {
	await keyedValuesUpdate((await render(KeyedValuesPage)).container as HTMLElement);
});

test('server render + resume: number keys, object values and a Set nested in an object survive', async () => {
	await keyedValuesUpdate((await renderSSR(KeyedValuesPage)).container as HTMLElement);
});

async function asyncKeyRefetches(container: HTMLElement) {
	const { press, shows } = kit(container);
	await shows('[data-o]', 'user 1');
	press('[data-sel]');
	await shows('[data-o]', 'user 2');
	press('[data-set]');
	await shows('[data-o]', 'user 7');
}

test('browser render: an async computed keyed by a Map read refetches on set', async () => {
	await asyncKeyRefetches((await render(AsyncKeyPage)).container as HTMLElement);
});

test('server render + resume: an async computed keyed by a Map read refetches on set', async () => {
	await asyncKeyRefetches((await renderSSR(AsyncKeyPage)).container as HTMLElement);
});
