import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FactoryPage from './factory-page.tsrx';
import PluralPage from './plural-page.tsrx';
import SinglePage from './single-page.tsrx';
import WidthPage from './width-page.tsrx';

/**
 * What a `computed()` sees when it reads an element() handle, against what a
 * handler sees for the identical read on the same widget.
 *
 * The measured answer, every row, both modes: the computed reads `undefined` -
 * not an empty set, not a stale element - while a state cell read by the SAME
 * derivation on the SAME pass is live. The handler answers the real elements.
 * Nothing is reported: no diagnostic, no console warning, no thrown error. The
 * derivation quietly publishes a value built out of `undefined`.
 *
 * The mechanism in plain words: a handle read is rewritten into a DOM lookup
 * only for handler-shaped symbols. Every other symbol, a sync derive included,
 * leaves the read on the ordinary graph path, where an element node holds no
 * value and answers `undefined`. Nothing refuses the read on the way in either:
 * the derive collector files an element binding as an ordinary dependency, and
 * the one diagnostic about reading an unbound handle only inspects reads written
 * in MARKUP, which a computed body is not.
 *
 * The rows below are green - they pin the misbehaviour so it cannot change
 * unnoticed. The `test.fails` rows beneath them state what a consumer writing
 * this code expects, so the day a handle read in a derive is made live (or
 * refused) those rows turn red and say so.
 */
afterEach(() => cleanup());

function node(container: ParentNode, attribute: string) {
	const found = container.querySelector<HTMLElement>(`[${attribute}]`);
	if (!found) throw new Error(`Expected [${attribute}].`);
	return found;
}

async function pluralReadings(screen: { readonly container: unknown }) {
	const container = screen.container as HTMLElement;
	const root = node(container, 'data-hic-plural-root');
	const first = root.getAttribute('data-derived');

	node(container, 'data-hic-bump').click();
	await expect.poll(() => root.getAttribute('data-derived')).not.toBe(first);
	const afterBump = root.getAttribute('data-derived');

	node(container, 'data-hic-probe').click();
	await expect.poll(() => root.getAttribute('data-probed')).not.toBe('');

	return {
		first,
		afterBump,
		probed: root.getAttribute('data-probed'),
		items: container.querySelectorAll('[data-hic-item]').length,
	};
}

test('CSR: a part computed reads a plural handle as undefined while its state cell is live', async () => {
	const readings = await pluralReadings(await render(PluralPage));

	expect(readings.items).toBe(3);
	// The `0|` and `1|` are the state cell inside the same derivation: it moved,
	// so the derivation really did run. The handle beside it never answers.
	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	// The identical read from a handler, after the same bump.
	expect(readings.probed).toBe('1|3');
});

test('SSR resume: the served part computed reads the plural handle as undefined', async () => {
	const readings = await pluralReadings(await renderSSR(PluralPage));

	expect(readings.items).toBe(3);
	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	expect(readings.probed).toBe('1|3');
});

test.fails('CSR: a part computed counts the same elements its handler counts', async () => {
	const readings = await pluralReadings(await render(PluralPage));

	expect(readings.afterBump).toBe('1|3');
});

async function singleReadings(screen: { readonly container: unknown }) {
	const container = screen.container as HTMLElement;
	const root = node(container, 'data-hic-single-root');
	const first = root.getAttribute('data-derived');
	const whereFirst = root.getAttribute('data-where');

	node(container, 'data-hic-bump').click();
	await expect.poll(() => root.getAttribute('data-derived')).not.toBe(first);
	const afterBump = root.getAttribute('data-derived');

	node(container, 'data-hic-probe').click();
	await expect.poll(() => root.getAttribute('data-probed')).not.toBe('');

	return {
		first,
		whereFirst,
		afterBump,
		whereAfterBump: root.getAttribute('data-where'),
		probed: root.getAttribute('data-probed'),
	};
}

test('CSR: a part computed reads its own singular handle as undefined', async () => {
	const readings = await singleReadings(await render(SinglePage));

	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	// The host that handle is bound to is the very element carrying the attribute.
	expect(readings.probed).toBe('1|div|dom');
	expect([readings.whereFirst, readings.whereAfterBump]).toEqual(['0|dom', '1|dom']);
});

test('SSR resume: the served part computed reads its own singular handle as undefined', async () => {
	const readings = await singleReadings(await renderSSR(SinglePage));

	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	expect(readings.probed).toBe('1|div|dom');
	// The served derivation runs where there is no DOM at all; the re-derive after
	// resume runs in the browser, with the elements present, and STILL reads
	// nothing. So this is not a timing problem the browser pass fixes.
	expect([readings.whereFirst, readings.whereAfterBump]).toEqual(['0|no-dom', '1|dom']);
});

test.fails('CSR: a part computed names the element its own handle is bound to', async () => {
	const readings = await singleReadings(await render(SinglePage));

	expect(readings.afterBump).toBe('1|div');
});

async function factoryReadings(screen: { readonly container: unknown }) {
	const container = screen.container as HTMLElement;
	const root = node(container, 'data-hic-factory-root');
	const first = root.getAttribute('data-derived');

	node(container, 'data-hic-bump').click();
	await expect.poll(() => root.getAttribute('data-derived')).not.toBe(first);
	const afterBump = root.getAttribute('data-derived');

	node(container, 'data-hic-probe').click();
	await expect.poll(() => root.getAttribute('data-probed')).not.toBe('');

	return { first, afterBump, probed: root.getAttribute('data-probed') };
}

test('CSR: a factory computed reads the handle as undefined, same as a part computed', async () => {
	const readings = await factoryReadings(await render(FactoryPage));

	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	expect(readings.probed).toBe('1|3');
});

test('SSR resume: the served factory computed reads the handle as undefined', async () => {
	const readings = await factoryReadings(await renderSSR(FactoryPage));

	expect(readings.first).toBe('0|undefined');
	expect(readings.afterBump).toBe('1|undefined');
	expect(readings.probed).toBe('1|3');
});

test.fails('CSR: a factory computed counts the same elements its handler counts', async () => {
	const readings = await factoryReadings(await render(FactoryPage));

	expect(readings.afterBump).toBe('1|3');
});

async function widthReadings(screen: { readonly container: unknown }) {
	const container = screen.container as HTMLElement;
	const root = node(container, 'data-hic-width-root');
	const first = root.getAttribute('data-derived');
	const firstStyle = root.getAttribute('style');

	node(container, 'data-hic-measure').click();
	await expect.poll(() => root.getAttribute('data-derived')).not.toBe(first);
	const afterMeasure = root.getAttribute('data-derived');
	const afterStyle = root.getAttribute('style');

	node(container, 'data-hic-probe').click();
	await expect.poll(() => root.getAttribute('data-probed')).not.toBe('');

	return {
		first,
		firstStyle,
		afterMeasure,
		afterStyle,
		probed: root.getAttribute('data-probed'),
		derivedProperty: getComputedStyle(root).getPropertyValue('--hic-width').trim(),
		handlerProperty: getComputedStyle(root).getPropertyValue('--hic-handler-width').trim(),
		trackWidth: node(container, 'data-hic-track').getBoundingClientRect().width,
	};
}

test('CSR: a computed measuring a handle publishes the word undefined as its custom property', async () => {
	const readings = await widthReadings(await render(WidthPage));

	expect(readings.trackWidth).toBe(120);
	// The gate is off first, so the derivation never touches the handle and the
	// custom property is honest.
	expect(readings.first).toBe('idle');
	expect(readings.firstStyle).toBe('--hic-width:idle;');
	// Flipped on, long after every element exists. The handle still answers
	// nothing, and the nine letters of `undefined` reach CSS as the value.
	expect(readings.afterMeasure).toBe('undefined');
	expect(readings.afterStyle).toBe('--hic-width:undefined;');
	expect(readings.derivedProperty).toBe('undefined');
	// The handler measures the same element and writes the real number.
	expect(readings.probed).toBe('120px');
	expect(readings.handlerProperty).toBe('120px');
});

test('SSR resume: the served measuring computed publishes undefined too', async () => {
	const readings = await widthReadings(await renderSSR(WidthPage));

	expect(readings.first).toBe('idle');
	expect(readings.afterMeasure).toBe('undefined');
	expect(readings.derivedProperty).toBe('undefined');
	expect(readings.probed).toBe('120px');
	expect(readings.handlerProperty).toBe('120px');
});

test.fails('CSR: a computed measuring a handle publishes the measured width', async () => {
	const readings = await widthReadings(await render(WidthPage));

	expect(readings.derivedProperty).toBe('120px');
});
