import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { asked, hold, release, reset } from './gates.ts';
import { Convert } from './convert.tsrx';
import { Groups } from './groups.tsrx';
import { Narrow } from './narrow.tsrx';
import { Prices } from './prices.tsrx';
import { Rates } from './rates.tsrx';
import { Revenue } from './revenue.tsrx';
import { Share } from './share.tsrx';
import { Stock } from './stock.tsrx';
import { Stores } from './stores.tsrx';
import { Tabs } from './tabs.tsrx';

// While an async value refreshes, whatever reads it beside an input of its key reads that input as the
// shown value was fetched with it, until the new value lands; inputs outside the key stay live.
afterEach(() => {
	reset();
	cleanup();
});

type Mount = () => Promise<{ readonly container: unknown }>;

function each(name: string, mounts: { readonly csr: Mount; readonly ssr: Mount }, check: (container: HTMLElement) => Promise<void>) {
	for (const [mode, mount] of [['client-rendered', mounts.csr], ['server-rendered', mounts.ssr]] as const)
		test(`${name} (${mode})`, async () => {
			const screen = await mount();
			await check(screen.container as HTMLElement);
		});
}

const text = (container: HTMLElement, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;
const texts = (container: HTMLElement, selector: string) =>
	[...container.querySelectorAll(selector)].map((node) => node.textContent).join('|');
const click = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLElement>(selector)!.click();
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

// Every value a selector showed while the watch ran, in order and without repeats.
function watch(container: HTMLElement, read: Record<string, () => string | null>) {
	const seen = Object.fromEntries(Object.keys(read).map((name) => [name, [] as Array<string | null>]));
	const record = () => {
		for (const [name, value] of Object.entries(read)) {
			const current = value();
			if (seen[name]!.at(-1) !== current) seen[name]!.push(current);
		}
	};
	const observer = new MutationObserver(record);
	observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true });
	record();
	return () => {
		observer.disconnect();
		record();
		return seen;
	};
}

each('UC10: a figure never pairs the old total with the new range', { csr: () => render(Revenue), ssr: () => renderSSR(Revenue) }, async (container) => {
	await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1000');
	await expect.poll(() => text(container, '[data-profit]')).toBe('5000');
	hold('revenue:20d', 'costs:20d');
	const stop = watch(container, {
		perDay: () => text(container, '[data-per-day]'),
		profit: () => text(container, '[data-profit]'),
		inline: () => text(container, '[data-inline]'),
	});
	click(container, '[data-twenty]');
	await expect.poll(() => text(container, '[data-range]')).toBe('20d');
	release('costs:20d');
	await settle();
	release('revenue:20d');
	await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1500');
	await expect.poll(() => text(container, '[data-profit]')).toBe('20000');
	await expect.poll(() => text(container, '[data-inline]')).toBe('1500');
	expect(stop()).toEqual({ perDay: ['1000', '1500'], profit: ['5000', '20000'], inline: ['1000', '1500'] });
});

each('UC11: a label beside a dependent fetch names the subject of its data', { csr: () => render(Stores), ssr: () => renderSSR(Stores) }, async (container) => {
	await expect.poll(() => text(container, '[data-heading]'), { timeout: 5_000 }).toBe('12 past orders in A');
	hold('orders:B', 'past:b1:mug');
	const stop = watch(container, { heading: () => text(container, '[data-heading]') });
	click(container, '[data-store-b]');
	await expect.poll(() => text(container, '[data-picked]')).toBe('B');
	release('orders:B');
	await settle();
	expect(text(container, '[data-heading]')).toBe('12 past orders in A');
	release('past:b1:mug');
	await expect.poll(() => text(container, '[data-heading]'), { timeout: 5_000 }).toBe('3 past orders in B');
	expect(stop()).toEqual({ heading: ['12 past orders in A', '3 past orders in B'] });
});

each('UC12: a list row and a formatted child prop never pair old prices with the new currency', { csr: () => render(Prices), ssr: () => renderSSR(Prices) }, async (container) => {
	const rows = () => texts(container, '[data-text]');
	const tags = () => texts(container, '[data-tag]');
	await expect.poll(rows, { timeout: 5_000 }).toBe('10 EUR|4 EUR');
	expect(tags()).toBe('10 EUR|4 EUR');
	hold('prices:USD');
	const stop = watch(container, { rows, tags });
	click(container, '[data-usd]');
	await expect.poll(() => text(container, '[data-currency]')).toBe('USD');
	await settle();
	expect(rows()).toBe('10 EUR|4 EUR');
	release('prices:USD');
	await expect.poll(rows, { timeout: 5_000 }).toBe('11 USD|5 USD');
	await expect.poll(tags).toBe('11 USD|5 USD');
	expect(stop()).toEqual({ rows: ['10 EUR|4 EUR', '11 USD|5 USD'], tags: ['10 EUR|4 EUR', '11 USD|5 USD'] });
});

each('UC14: the page catches up when the new answer equals the old', { csr: () => render(Stock), ssr: () => renderSSR(Stock) }, async (container) => {
	await expect.poll(() => text(container, '[data-line]'), { timeout: 5_000 }).toBe('Size M ships today');
	hold('stock:L');
	click(container, '[data-large]');
	await settle();
	expect(text(container, '[data-line]')).toBe('Size M ships today');
	release('stock:L');
	await expect.poll(() => text(container, '[data-line]'), { timeout: 5_000 }).toBe('Size L ships today');
});

each('UC16: a switch the refresh is not about applies at once, to a matched figure', { csr: () => render(Rates), ssr: () => renderSSR(Rates) }, async (container) => {
	await expect.poll(() => text(container, '[data-daily]'), { timeout: 5_000 }).toBe('1000');
	hold('sales:long');
	const stop = watch(container, { daily: () => text(container, '[data-daily]') });
	click(container, '[data-long]');
	await settle();
	click(container, '[data-dollars]');
	await expect.poll(() => text(container, '[data-daily]')).toBe('1100');
	expect(text(container, '[data-unit]')).toBe('USD');
	release('sales:long');
	await expect.poll(() => text(container, '[data-daily]'), { timeout: 5_000 }).toBe('1650');
	expect(stop()).toEqual({ daily: ['1000', '1100', '1650'] });
});

each('UC16′: the same switch reaches a value computed by a fetch, asked with the shown inputs', { csr: () => render(Convert), ssr: () => renderSSR(Convert) }, async (container) => {
	await expect.poll(() => text(container, '[data-converted]'), { timeout: 5_000 }).toBe('€1000');
	hold('income:1m');
	asked.length = 0;
	const stop = watch(container, { converted: () => text(container, '[data-converted]') });
	click(container, '[data-month]');
	await settle();
	click(container, '[data-usd]');
	await expect.poll(() => text(container, '[data-converted]'), { timeout: 5_000 }).toBe('$1100');
	expect(asked.join(' ')).toBe('income:1m convert:10000:10:USD');
	release('income:1m');
	await expect.poll(() => text(container, '[data-converted]'), { timeout: 5_000 }).toBe('$1650');
	expect(asked.at(-1)).toBe('convert:30000:20:USD');
	expect(stop()).toEqual({ converted: ['€1000', '$1100', '$1650'] });
});

each('UC17: a slow refresh does not block a computation over an input its fetch did not read', { csr: () => render(Groups), ssr: () => renderSSR(Groups) }, async (container) => {
	await expect.poll(() => text(container, '[data-shown]'), { timeout: 5_000 }).toBe('s1 l1 s2');
	hold('rows:2');
	click(container, '[data-next]');
	await settle();
	click(container, '[data-small]');
	await expect.poll(() => text(container, '[data-shown]')).toBe('s1 s2');
	release('rows:2');
	await expect.poll(() => text(container, '[data-shown]'), { timeout: 5_000 }).toBe('');
});

each('UC20, UC21, UC25: the clicked control moves at once, two clicks count as two, a sync value never waits', { csr: () => render(Tabs), ssr: () => renderSSR(Tabs) }, async (container) => {
	await expect.poll(() => text(container, '[data-page]'), { timeout: 5_000 }).toBe('Page uno');
	await expect.poll(() => text(container, '[data-quote]')).toBe('5');
	hold('page:dos', 'quote:2', 'quote:3');
	click(container, '[data-dos]');
	await expect.poll(() => container.querySelector('[data-dos]')?.className).toBe('selected');
	expect(container.querySelector('[data-uno]')?.className).toBe('');
	await expect.poll(() => text(container, '[data-title]')).toBe('DOS');
	expect(text(container, '[data-page]')).toBe('Page uno');
	click(container, '[data-plus]');
	await expect.poll(() => text(container, '[data-plus]')).toBe('2');
	click(container, '[data-plus]');
	await expect.poll(() => text(container, '[data-plus]')).toBe('3');
	expect(text(container, '[data-quote]')).toBe('5');
	release('page:dos');
	release('quote:3');
	await expect.poll(() => text(container, '[data-page]'), { timeout: 5_000 }).toBe('Page dos');
	await expect.poll(() => text(container, '[data-quote]'), { timeout: 5_000 }).toBe('15');
});

each('UC29, UC30: a handler acts on the pair the screen shows, and a re-ask does not block it', { csr: () => render(Share), ssr: () => renderSSR(Share) }, async (container) => {
	await expect.poll(() => text(container, '[data-figure]'), { timeout: 5_000 }).toBe('1000');
	hold('revenue:20d:0');
	click(container, '[data-span]');
	await settle();
	click(container, '[data-share]');
	await expect.poll(() => text(container, '[data-shared]')).toBe('1000 a day over 10d');
	release('revenue:20d:0');
	await expect.poll(() => text(container, '[data-figure]'), { timeout: 5_000 }).toBe('1500');
	hold('revenue:20d:1');
	click(container, '[data-again]');
	await settle();
	click(container, '[data-share]');
	await expect.poll(() => text(container, '[data-shared]')).toBe('1500 a day over 20d');
	release('revenue:20d:1');
});

each('mixing on purpose: a value over an input its fetch did not read narrows the old answer at once', { csr: () => render(Narrow), ssr: () => renderSSR(Narrow) }, async (container) => {
	await expect.poll(() => text(container, '[data-visible]'), { timeout: 5_000 }).toBe('apple,apricot,banana,grape');
	hold('found:ap');
	const box = container.querySelector<HTMLInputElement>('[data-box]')!;
	box.value = 'ap';
	box.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => text(container, '[data-visible]'), { timeout: 5_000 }).toBe('apple,apricot,grape');
	release('found:ap');
	await settle();
	expect(text(container, '[data-visible]')).toBe('apple,apricot,grape');
});
