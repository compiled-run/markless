import { decodePayloadScriptsFromDocument } from '@markless/web/payload';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../../src/index.ts';
import { AllE } from './all-e.tsrx';
import { AllP } from './all-p.tsrx';
import { DependentE } from './dependent-e.tsrx';
import { HelperE } from './helper-e.tsrx';
import { HelperP } from './helper-p.tsrx';
import { count, entries, release, resetLog } from './loader.ts';
import { LocaleE } from './locale-e.tsrx';
import { LocaleP } from './locale-p.tsrx';
import { ObjectE } from './object-e.tsrx';
import { ObjectP } from './object-p.tsrx';
import { SequentialE } from './sequential-e.tsrx';
import { SequentialP } from './sequential-p.tsrx';

// Each scenario runs twice: reads after the await (captured by the compiler) and the
// same body with those reads copied into a const before the await. Both must agree.

afterEach(() => cleanup());

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent ?? null;
const press = (root: ParentNode, selector: string) => {
	const element = root.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	element.click();
};
const starts = (name?: string) => expect.poll(() => count('start', name), { timeout: 3_000 });
const settlesTo = (root: ParentNode, selector: string, value: string) =>
	expect
		.poll(
			() => {
				release();
				return text(root, selector);
			},
			{ timeout: 3_000 },
		)
		.toBe(value);

const variants = [
	[
		'captured',
		{ Locale: LocaleP, Object: ObjectP, Helper: HelperP, Sequential: SequentialP, All: AllP },
	],
	[
		'copied first',
		{ Locale: LocaleE, Object: ObjectE, Helper: HelperE, Sequential: SequentialE, All: AllE },
	],
] as const;

for (const [variant, pages] of variants) {
	test(`${variant}: a read after the await reruns the computed when it changes`, async () => {
		resetLog();
		const { container } = await render(pages.Locale);
		await settlesTo(container, '[data-o]', 'Ada@en');
		press(container, '[data-locale]');
		await settlesTo(container, '[data-o]', 'Ada@fr');
		expect([count('run'), count('start'), count('abort')]).toEqual([2, 2, 0]);
	});

	test(`${variant}: a change during the await aborts the run and starts one with the new value`, async () => {
		resetLog();
		const { container } = await render(pages.Locale);
		await starts().toBe(1);
		press(container, '[data-locale]');
		await starts().toBe(2);
		expect(count('abort')).toBe(1);
		await settlesTo(container, '[data-o]', 'Ada@fr');
		expect(count('run')).toBe(2);
	});

	test(`${variant}: an object field written in place during the await`, async () => {
		resetLog();
		const { container } = await render(pages.Object);
		await starts().toBe(1);
		press(container, '[data-sort]');
		await starts().toBe(2);
		expect(count('abort')).toBe(1);
		await settlesTo(container, '[data-o]', 'rows:a:desc');
	});

	test(`${variant}: reads inside called helpers, sync and async`, async () => {
		resetLog();
		const { container } = await render(pages.Helper);
		await starts('user').toBe(1);
		press(container, '[data-prefix]');
		await starts('user').toBe(2);
		await settlesTo(container, '[data-o]', 'Prof Ada/11');
		press(container, '[data-count]');
		await settlesTo(container, '[data-o]', 'Prof Ada/15');
	});

	test(`${variant}: awaits in one body run in order, separate computeds start together`, async () => {
		resetLog();
		const { container } = await render(pages.Sequential);
		await starts().toBe(3);
		expect(
			entries()
				.map((entry) => `${entry.ev} ${entry.name}`)
				.sort(),
		).toEqual(
			[
				'run both',
				'run left',
				'run right',
				'start a:x1',
				'start left:x1',
				'start right:y1',
			].sort(),
		);
		await settlesTo(container, '[data-o]', 'AB');
		await settlesTo(container, '[data-split]', 'LR');
		const log = entries().map((entry) => `${entry.ev} ${entry.name}`);
		expect(log.indexOf('start b:y1')).toBeGreaterThan(log.indexOf('end a:x1'));
	});

	test(`${variant}: Promise.all starts both loads, a read after it reruns both`, async () => {
		resetLog();
		const { container } = await render(pages.All);
		await starts().toBe(2);
		expect(count('end')).toBe(0);
		await settlesTo(container, '[data-o]', 'AB:z1');
		press(container, '[data-z]');
		await settlesTo(container, '[data-o]', 'AB:z2');
		expect(count('start')).toBe(4);
	});
}

test('a lookup keyed by the awaited value, split into a sync computed, never refetches', async () => {
	resetLog();
	const { container } = await render(DependentE);
	await settlesTo(container, '[data-o]', 'apple');
	press(container, '[data-rename]');
	await settlesTo(container, '[data-o]', 'apricot');
	expect(count('start')).toBe(1);
});

async function resumeThenChange(phased: Awaited<ReturnType<typeof renderSSRPhased>>) {
	const { state } = decodePayloadScriptsFromDocument(
		new DOMParser().parseFromString(phased.html, 'text/html'),
	);
	const card = (state as { computed: Array<{ name?: string }> }).computed.find(
		(entry) => entry.name === 'card',
	);
	resetLog();
	const { container } = phased.mount();
	expect(text(container, '[data-o]')).toBe('Ada@en');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(entries()).toEqual([]);
	press(container, '[data-locale]');
	await settlesTo(container, '[data-o]', 'Ada@fr');
	expect([count('run'), count('start')]).toEqual([1, 1]);
	return card;
}

test('server render and resume: no rerun after resume, the same payload as copying first', async () => {
	const captured = await resumeThenChange(await renderSSRPhased(LocaleP));
	await cleanup();
	const copied = await resumeThenChange(await renderSSRPhased(LocaleE));
	expect(captured).toEqual(copied);
});
