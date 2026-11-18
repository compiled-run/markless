import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import SiteCardPage from './site-card-page.tsrx';
import SiteHeldPage from './site-held-page.tsrx';
import SitePage from './site-page.tsrx';

// The notes site's failed-refresh demo as written: after a failed page load, the kept rows follow the USD switch.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent);
const button = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('button')].find(
		(node) => node.textContent?.trim() === name,
	)!;
const usd = () => document.querySelector<HTMLElement>('[role=switch]')!;

async function reply(key: string, failure?: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key, failure);
}

async function demo() {
	expect(texts('tbody tr td:nth-child(2)')).toEqual(['INV-001', 'INV-002', 'INV-003', 'INV-004']);
	usd().click();
	await expect.poll(() => texts('[data-amount]')[0]).toBe('$275.00');
	usd().click();
	await expect.poll(() => texts('[data-amount]')[0]).toBe('€250.00');
	button('Next').click();
	await reply('site:2:0');
	await expect
		.poll(() => texts('tbody tr td:nth-child(2)'))
		.toEqual(['INV-005', 'INV-006', 'INV-007', 'INV-008']);
	await expect.poll(() => texts('[data-page-label]')).toEqual(['Page 2 of 3']);
	document.querySelector<HTMLElement>('[aria-label="Select INV-005"]')!.click();
	await expect
		.poll(() =>
			document.querySelector('[aria-label="Select INV-005"]')?.getAttribute('aria-checked'),
		)
		.toBe('true');
	button('Next').click();
	await reply('site:3:0', 'offline');
	await expect.poll(() => texts('[data-slot=alert]').length).toBe(1);
	expect(texts('tbody tr td:nth-child(2)')).toEqual(['INV-005', 'INV-006', 'INV-007', 'INV-008']);
	expect(texts('[data-page-label]')).toEqual(['Page 2 of 3']);
	usd().click();
	await expect.poll(() => usd().getAttribute('aria-checked')).toBe('true');
	await expect.poll(() => texts('[data-amount]')[0]).toBe('$605.00');
	usd().click();
	await expect.poll(() => texts('[data-amount]')[0]).toBe('€550.00');
	usd().click();
	button('Previous').click();
	await reply('site:1:0');
	await expect
		.poll(() => texts('tbody tr td:nth-child(2)'))
		.toEqual(['INV-001', 'INV-002', 'INV-003', 'INV-004']);
	expect(texts('[data-slot=alert]')).toEqual([]);
	await expect.poll(() => texts('[data-amount]')[0]).toBe('$275.00');
}

test('CSR: the site demo follows its switch after a failed refresh', async () => {
	await render(SitePage);
	await reply('site:1:0');
	await expect.poll(() => texts('[data-amount]').length).toBe(4);
	await demo();
});

// Each @try arm loads its own code once the page data lands; a switch click while one is still loading must not freeze it on @pending.
test('CSR: a @try arm whose code lands after a switch click still reveals its settled content', async () => {
	const base = SitePage as unknown as { readonly loadSymbol: (symbolId: string) => unknown };
	const mount = async (late: (symbolId: string) => boolean) => {
		const armCode: string[] = [];
		let settling = false;
		await render({
			...base,
			loadSymbol: async (symbolId: string) => {
				if (settling) armCode.push(symbolId);
				if (late(symbolId)) await new Promise((resolve) => setTimeout(resolve, 300));
				return base.loadSymbol(symbolId);
			},
		} as typeof SitePage);
		await expect.poll(() => asked('site:1:0')).toBe(true);
		settling = true;
		answer('site:1:0');
		await expect.poll(() => texts('[data-amount]').length).toBe(4);
		settling = false;
		usd().click();
		await expect.poll(() => texts('[data-amount]')[0]).toBe('$275.00');
		await expect.poll(() => (button('Next') as HTMLButtonElement).disabled).toBe(false);
		cleanup();
		forgetRequests();
		return armCode;
	};
	const symbols = [...new Set(await mount(() => false))];
	expect(symbols.length).toBeGreaterThan(1);
	for (const symbol of symbols) await mount((symbolId) => symbolId === symbol);
});

test('SSR: the site demo follows its switch after a failed refresh after resume', async () => {
	await renderSSR(SitePage);
	await demo();
});

test('SSR: the restarted site demo follows its switch after a failed refresh', async () => {
	await renderSSR(SitePage);
	button('restart').click();
	await reply('site:1:0');
	await expect.poll(() => texts('[data-amount]').length).toBe(4);
	await demo();
});

test('CSR: the site demo inside its card follows its switch after a failed refresh', async () => {
	await render(SiteCardPage);
	await reply('site:1:0');
	await expect.poll(() => texts('[data-amount]').length).toBe(4);
	await demo();
});

test('SSR: the site demo inside its card follows its switch after a failed refresh after resume', async () => {
	await renderSSR(SiteCardPage);
	await demo();
});

test('SSR: the restarted site demo inside its card follows its switch after a failed refresh', async () => {
	await renderSSR(SiteCardPage);
	button('restart').click();
	await reply('site:1:0');
	await expect.poll(() => texts('[data-amount]').length).toBe(4);
	await demo();
});

test('CSR: beside a value that pairs state with an async value, the site demo follows its switch after a failed refresh', async () => {
	await render(SiteHeldPage);
	await reply('site:1:0');
	await expect.poll(() => texts('[data-amount]').length).toBe(4);
	await demo();
});

test('SSR: beside a value that pairs state with an async value, the site demo follows its switch after a failed refresh after resume', async () => {
	await renderSSR(SiteHeldPage);
	await demo();
});
