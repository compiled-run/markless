import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CustomerCard from './optional-read.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function followsEachCustomer() {
	await expect.poll(() => text('[data-optional]')).toBe('customer 1');
	expect(text('[data-asserted]')).toBe('tier 1');
	expect(document.querySelector('[data-asserted]')?.getAttribute('title')).toBe('tier 1');

	click('[data-next]');
	await expect.poll(() => text('[data-optional]')).toBe('customer 2');
	await expect.poll(() => text('[data-asserted]')).toBe('tier 2');
	expect(document.querySelector('[data-asserted]')?.getAttribute('title')).toBe('tier 2');

	click('[data-none]');
	await expect.poll(() => document.querySelector('[data-optional]')?.textContent?.trim()).toBe('');
}

test('CSR: a @try reading an async value through ?. or ! follows it', async () => {
	await render(CustomerCard);
	await expect.poll(() => text('[data-optional-loading]')).toBe('Loading');
	await followsEachCustomer();
});

// Each symbol arrives in its own task, 20 ms after the one asked before it, so a block that commits once its own code is in shows alone.
test('CSR: two blocks settling on one value land in one task when their code arrives in separate tasks', async () => {
	const base = CustomerCard as unknown as { readonly loadSymbol: (symbolId: string) => unknown };
	let asked = 0;
	const samples: string[] = [];
	const channel = new MessageChannel();
	channel.port1.onmessage = () => samples.push(`${text('[data-optional]') ?? '-'}|${text('[data-asserted]') ?? '-'}`);
	const observer = new MutationObserver(() => channel.port2.postMessage(0));
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
	try {
		await render({
			...base,
			loadSymbol: (symbolId: string) => {
				const delay = 20 * ++asked;
				return new Promise((resolve) => setTimeout(resolve, delay)).then(() => base.loadSymbol(symbolId));
			},
		} as typeof CustomerCard);
		await expect.poll(() => text('[data-asserted]')).toBe('tier 1');
		await new Promise((resolve) => setTimeout(resolve, 20));
	} finally {
		observer.disconnect();
	}
	expect(samples.filter((sample) => sample.includes('-') && sample !== '-|-')).toEqual([]);
	expect(samples.at(-1)).toBe('customer 1|tier 1');
});

test('CSR: a block whose code fails to load leaves the other block on the same value updated', async () => {
	type Card = {
		readonly loadSymbol: (symbolId: string) => unknown;
		readonly renderData: { readonly components: Record<string, { readonly view: { readonly asyncBoundaries: ReadonlyArray<{ readonly updateSymbolId: string }> } }> };
	};
	const base = CustomerCard as unknown as Card;
	const failing = Object.values(base.renderData.components)[0]!.view.asyncBoundaries[1]!.updateSymbolId;
	let fail = true;
	const errors: unknown[] = [];
	const caught = (event: PromiseRejectionEvent) => {
		if ((event.reason as Error)?.message !== 'chunk failed') return;
		errors.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', caught);
	try {
		await render({
			...base,
			loadSymbol: (symbolId: string) =>
				symbolId === failing && fail ? Promise.reject(new Error('chunk failed')) : base.loadSymbol(symbolId),
		} as unknown as typeof CustomerCard);
		await expect.poll(() => text('[data-optional]')).toBe('customer 1');
		expect(text('[data-asserted-loading]')).toBe('Loading');
		await expect.poll(() => errors.length).toBeGreaterThan(0);

		fail = false;
		click('[data-next]');
		await expect.poll(() => text('[data-optional]')).toBe('customer 2');
		await expect.poll(() => text('[data-asserted]')).toBe('tier 2');
		expect(document.querySelectorAll('[data-optional-loading], [data-asserted-loading]')).toHaveLength(0);
	} finally {
		window.removeEventListener('unhandledrejection', caught);
	}
});

test('SSR: a @try reading an async value through ?. or ! follows it', async () => {
	await renderSSR(CustomerCard);
	await followsEachCustomer();
});
