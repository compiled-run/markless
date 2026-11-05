import { afterEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { failNext } from './pages.ts';
import TemplateLabel from './template-label.tsrx';
import TwoHoleLabel from './two-hole-label.tsrx';

// A label and the rows beside it, read from one async answer, paint together: on a refresh
// and on the answer that replaces a @catch.

afterEach(() => {
	failNext(0);
	cleanup();
});
afterEach(() => commands.throttleCpu(1));

const LOADS = { timeout: 10_000 };
const textOf = (selector: string) =>
	document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const rows = () =>
	[...document.querySelectorAll('[data-row]')].map((row) => row.textContent?.trim() ?? '');
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const pageOf = (label: string | null) => label?.match(/^Page (\d+)/)?.[1] ?? null;

// Every distinct label/rows pair the browser could paint: judged when a task ends and before each frame.
function paintedPairs(): () => string[] {
	const read = () =>
		`${textOf('[data-label]')} | ${rows().join(', ')}${document.querySelector('[data-error]') ? ' | error' : ''}`;
	const seen = [read()];
	const record = () => seen.at(-1) !== read() && seen.push(read());
	const channel = new MessageChannel();
	channel.port1.onmessage = record;
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
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

const mixed = (pairs: string[]) =>
	pairs.filter((pair) => {
		const page = pageOf(pair.split(' | ')[0]);
		return !pair
			.split(' | ')[1]
			.split(', ')
			.every((row) => row.startsWith(`p${page} `));
	});

async function refreshPaintsTogether(label: (page: number) => string) {
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe(label(1));
	const painted = paintedPairs();
	click('[data-next]');
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe(label(2));
	await expect.poll(rows, LOADS).toEqual(['p2 first', 'p2 second']);
	{
		const seen = painted();
		expect(mixed(seen), seen.join('\n')).toEqual([]);
	}
}

async function answerAfterCatchPaintsTogether(label: (page: number) => string) {
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe(label(1));
	const painted = paintedPairs();
	failNext();
	click('[data-next]');
	await expect.poll(() => document.querySelector('[data-error]'), LOADS).not.toBe(null);
	click('[data-next]');
	await expect.poll(() => textOf('[data-label]'), LOADS).toBe(label(3));
	await expect.poll(rows, LOADS).toEqual(['p3 first', 'p3 second']);
	await expect.poll(() => document.querySelector('[data-error]'), LOADS).toBe(null);
	{
		const seen = painted();
		expect(mixed(seen), seen.join('\n')).toEqual([]);
	}
}

const RUNS = 3;
const templateLabel = (page: number) => `Page ${page}`;
const twoHoleLabel = (page: number) => `Page ${page} of ${page + 2}`;

for (let run = 1; run <= RUNS; run++) {
	test(`CSR: a template-string label and its rows paint together on a refresh (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(TemplateLabel);
		await refreshPaintsTogether(templateLabel);
	});

	test(`SSR: a template-string label and its rows paint together on a refresh after resume (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await renderSSR(TemplateLabel);
		await refreshPaintsTogether(templateLabel);
	});

	test(`CSR: a template-string label and its rows paint together on the answer after a @catch (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(TemplateLabel);
		await answerAfterCatchPaintsTogether(templateLabel);
	});

	test(`SSR: a template-string label and its rows paint together on the answer after a @catch after resume (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await renderSSR(TemplateLabel);
		await answerAfterCatchPaintsTogether(templateLabel);
	});

	test(`CSR: a two-hole label and its rows paint together on a refresh (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(TwoHoleLabel);
		await refreshPaintsTogether(twoHoleLabel);
	});

	test(`SSR: a two-hole label and its rows paint together on a refresh after resume (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await renderSSR(TwoHoleLabel);
		await refreshPaintsTogether(twoHoleLabel);
	});

	test(`CSR: a two-hole label and its rows paint together on the answer after a @catch (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(TwoHoleLabel);
		await answerAfterCatchPaintsTogether(twoHoleLabel);
	});

	test(`SSR: a two-hole label and its rows paint together on the answer after a @catch after resume (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await renderSSR(TwoHoleLabel);
		await answerAfterCatchPaintsTogether(twoHoleLabel);
	});
}
