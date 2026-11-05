import { afterEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedChildFlip from './imported-child-flip.tsrx';
import RefreshFlipPair from './refresh-flip-pair.tsrx';

// A refresh that flips an @if holding a component lands with the text beside it, on a slow main thread too.

afterEach(cleanup);
afterEach(() => commands.throttleCpu(1));

const LOADS = { timeout: 10_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

// Every distinct state the browser could paint: judged when a task ends and before each frame.
function paintedStates(read: () => string): () => string[] {
	const seen = [read()];
	const record = () => seen.at(-1) !== read() && seen.push(read());
	const channel = new MessageChannel();
	channel.port1.onmessage = record;
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
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

async function headingAndBadgeLandTogether() {
	await expect.poll(() => textOf('h3'), LOADS).toBe('account 0');
	click('[data-again]');
	await expect.poll(() => textOf('h3'), LOADS).toBe('account 1');
	const painted = paintedStates(() => `${textOf('h3')} | ${textOf('[data-plain]') ?? textOf('[data-badge-label]')}`);
	click('[data-again]');
	await expect.poll(() => textOf('[data-badge-label]'), LOADS).toBe('account 2');
	expect(painted()).toEqual(['account 1 | regular account 1', 'account 2 | account 2']);
}

async function titleAndStampLandTogether() {
	await expect.poll(() => textOf('[data-title]'), LOADS).toBe('account 0');
	const painted = paintedStates(() => `${textOf('[data-basic]') ?? textOf('[data-stamp]')} / ${textOf('[data-title]')}`);
	click('[data-step]');
	await expect.poll(() => textOf('[data-stamp]'), LOADS).toBe('account 1');
	expect(painted()).toEqual(['account 0 basic / account 0', 'account 1 / account 1']);
}

for (let run = 1; run <= 20; run++) {
	test(`CSR: a flip and the heading beside it paint together on a slow main thread (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await render(ImportedChildFlip);
		await headingAndBadgeLandTogether();
	});

	test(`SSR: a flip and the heading beside it paint together on a slow main thread after resume (run ${run})`, async () => {
		await commands.throttleCpu(6);
		await renderSSR(ImportedChildFlip);
		await headingAndBadgeLandTogether();
	});
}

test('CSR: a same-file child flipped in before its title paints with it', async () => {
	await commands.throttleCpu(6);
	await render(RefreshFlipPair);
	await titleAndStampLandTogether();
});

test('SSR: a same-file child flipped in before its title paints with it after resume', async () => {
	await commands.throttleCpu(6);
	await renderSSR(RefreshFlipPair);
	await titleAndStampLandTogether();
});
