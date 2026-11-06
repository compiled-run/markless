import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { asked, fail, hold, release, reset } from './gates.ts';
import { Disagreement } from './disagreement.tsrx';
import { Revenue } from './revenue.tsrx';
import { Share } from './share.tsrx';

// A failed refresh keeps the pin a reader needs to read it (a value that would mix never
// falls back to the live, torn figure), and a source that outran a failed sibling still
// serves the kept answer it was fetched with. Maieul's errors UC16/UC18/UC20, plus the
// two-source disagreement UC16/UC20 and its Share handler, each under CSR and SSR.
afterEach(() => {
	reset();
	cleanup();
});

type Mount = () => Promise<{ readonly container: unknown }>;

function each(
	name: string,
	mounts: { readonly csr: Mount; readonly ssr: Mount },
	check: (container: HTMLElement) => Promise<void>,
) {
	for (const [mode, mount] of [
		['client-rendered', mounts.csr],
		['server-rendered', mounts.ssr],
	] as const)
		test(`${name} (${mode})`, async () => {
			const screen = await mount();
			await check(screen.container as HTMLElement);
		});
}

const text = (container: HTMLElement, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;
const click = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLElement>(selector)!.click();
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

// Every distinct (perDay, profit) pair the browser could paint, sampled on every mutation and
// before every frame, the way async-catch-recovery-paint samples a label and its rows.
function paintedPairs(container: HTMLElement): () => string[] {
	const read = () => `${text(container, '[data-per-day]')}|${text(container, '[data-profit]')}`;
	const seen = [read()];
	const record = () => seen.at(-1) !== read() && seen.push(read());
	const channel = new MessageChannel();
	channel.port1.onmessage = record;
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(container, { subtree: true, childList: true, characterData: true });
	let frame = requestAnimationFrame(function sample() {
		record();
		frame = requestAnimationFrame(sample);
	});
	return () => {
		observer.disconnect();
		cancelAnimationFrame(frame);
		channel.port1.close();
		record();
		return seen;
	};
}

each(
	'Errors UC16: a failed refresh keeps the pin, not the live mixed figure',
	{ csr: () => render(Revenue), ssr: () => renderSSR(Revenue) },
	async (container) => {
		await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1000');
		await expect.poll(() => text(container, '[data-profit]')).toBe('5000');
		hold('revenue:20d', 'costs:20d');
		const painted = paintedPairs(container);
		click(container, '[data-twenty]');
		await expect.poll(() => text(container, '[data-range]')).toBe('20d');
		release('costs:20d');
		await settle();
		fail('revenue:20d', 'offline');
		await settle();
		// What UC16 rejects: 10,000 / 20 = 500 and 10,000 - 10,000 = 0, figures no range produced.
		expect(text(container, '[data-per-day]')).toBe('1000');
		expect(text(container, '[data-profit]')).toBe('5000');
		expect(text(container, '[data-inline]')).toBe('1000');
		expect(container.querySelector('[data-error]')).toBe(null);
		// The outage holds, even past the point a success would have landed.
		await settle();
		expect(text(container, '[data-per-day]')).toBe('1000');
		{
			const seen = painted();
			expect(seen.every((frame) => !frame.includes('500') || frame.includes('1000'))).toBe(true);
		}
	},
);

each(
	'Errors UC18: a retry after a failure lands like a re-ask, not a wipe',
	{ csr: () => render(Revenue), ssr: () => renderSSR(Revenue) },
	async (container) => {
		await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1000');
		hold('revenue:20d', 'costs:20d');
		click(container, '[data-twenty]');
		await expect.poll(() => text(container, '[data-range]')).toBe('20d');
		release('costs:20d');
		await settle();
		fail('revenue:20d', 'offline');
		await settle();
		expect(text(container, '[data-per-day]')).toBe('1000');
		expect(container.querySelector('[data-error]')).toBe(null);
	},
);

each(
	'UC16/UC20 disagreement: a source that outran a failed sibling still serves its kept answer, and an unrelated switch applies at once',
	{ csr: () => render(Disagreement), ssr: () => renderSSR(Disagreement) },
	async (container) => {
		await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1000');
		await expect.poll(() => text(container, '[data-profit]')).toBe('5000');
		hold('dis-revenue:20d', 'dis-costs:20d');
		const painted = paintedPairs(container);
		click(container, '[data-twenty]');
		await settle();
		expect(text(container, '[data-profit]')).toBe('5000');
		release('dis-costs:20d');
		await settle();
		// costs landed for 20d; revenue is still pinned to 10d, so costs serves its kept 10d answer.
		expect(text(container, '[data-per-day]')).toBe('1000');
		expect(text(container, '[data-profit]')).toBe('5000');
		click(container, '[data-dollars]');
		await expect.poll(() => text(container, '[data-unit]')).toBe('USD');
		await expect.poll(() => text(container, '[data-per-day]')).toBe('1100');
		expect(text(container, '[data-profit]')).toBe('5500');
		fail('dis-revenue:20d', 'offline');
		await settle();
		// The outage keeps the pinned, converted pair beside it, never the torn one.
		expect(text(container, '[data-per-day]')).toBe('1100');
		expect(text(container, '[data-profit]')).toBe('5500');
		expect(container.querySelector('[data-error]')).toBe(null);
		{
			const seen = painted();
			const valid = new Set(['1000|5000', '1100|5500', 'null|null']);
			expect(seen.filter((frame) => !valid.has(frame)), seen.join('\n')).toEqual([]);
		}
	},
);

each(
	'UC16/UC20 disagreement, both land: the common range releases once every source has answered it',
	{ csr: () => render(Disagreement), ssr: () => renderSSR(Disagreement) },
	async (container) => {
		await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1000');
		hold('dis-revenue:20d', 'dis-costs:20d');
		click(container, '[data-twenty]');
		release('dis-costs:20d');
		await settle();
		release('dis-revenue:20d');
		await expect.poll(() => text(container, '[data-per-day]'), { timeout: 5_000 }).toBe('1500');
		await expect.poll(() => text(container, '[data-profit]')).toBe('20000');
	},
);

each(
	'UC29/Share, failed: a handler acts on the pair the screen shows, including under a failed refresh',
	{ csr: () => render(Share), ssr: () => renderSSR(Share) },
	async (container) => {
		await expect.poll(() => text(container, '[data-figure]'), { timeout: 5_000 }).toBe('1000');
		hold('revenue:20d:0');
		click(container, '[data-span]');
		await expect.poll(() => asked.includes('revenue:20d:0')).toBe(true);
		fail('revenue:20d:0', 'offline');
		await settle();
		click(container, '[data-share]');
		await expect.poll(() => text(container, '[data-shared]')).toBe('1000 a day over 10d');
	},
);
