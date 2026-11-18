import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import PendingImmediateProof from './pending-immediate.tsrx';
import { setLatency } from './latency-api.ts';

afterEach(() => cleanup());

type Sample = { readonly t: number; readonly pending: boolean; readonly content: boolean; readonly height: number };

// One rAF tick per sample, until the spot settles or a generous timeout elapses.
async function sample(slot: HTMLElement, startedAt: number, timeoutMs: number): Promise<Sample[]> {
	const samples: Sample[] = [];
	await new Promise<void>((resolve) => {
		const tick = () => {
			const t = performance.now() - startedAt;
			const content = !!slot.querySelector('[data-content]');
			samples.push({
				t,
				pending: !!slot.querySelector('[data-pending]'),
				content,
				height: slot.getBoundingClientRect().height,
			});
			if (content || t > timeoutMs) return resolve();
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	return samples;
}

function metrics(samples: Sample[]) {
	const firstShown = samples.findIndex((sample) => sample.pending || sample.content);
	const firstContent = samples.findIndex((sample) => sample.content);
	let flashes = 0;
	let wasPending = false;
	for (const sample of samples) {
		if (sample.pending && !wasPending) flashes += 1;
		wasPending = sample.pending;
	}
	const heights = new Set(samples.map((sample) => Math.round(sample.height)));
	return {
		blankMs: firstShown < 0 ? -1 : samples[firstShown]!.t,
		pendingFlashes: flashes,
		timeToCorrectMs: firstContent < 0 ? -1 : samples[firstContent]!.t,
		distinctHeights: heights.size,
	};
}

const LATENCIES = [100, 300, 2000];

for (const latencyMs of LATENCIES) {
	test(`first client-rendered mount at ${latencyMs}ms: @pending shows immediately, no deadline wait`, async () => {
		setLatency(latencyMs);
		const start = performance.now();
		const screen = await render(PendingImmediateProof);
		const slot = (screen.container as HTMLElement).querySelector('[data-mount-slot]') as HTMLElement;
		const samples = await sample(slot, start, latencyMs + 1_000);
		const result = metrics(samples);
		console.log('MOUNT', latencyMs, JSON.stringify(result));

		// A first run publishes pending synchronously, so blank time before @pending paints is one frame, not the settle deadline.
		expect(result.blankMs).toBeLessThan(100);
		expect(result.pendingFlashes).toBeLessThanOrEqual(1);
		expect(result.timeToCorrectMs).toBeGreaterThan(latencyMs - 20);
	});

	test(`a newly created row at ${latencyMs}ms: @pending shows immediately, no deadline wait`, async () => {
		setLatency(10);
		const screen = await render(PendingImmediateProof);
		const container = screen.container as HTMLElement;
		await expect.poll(() => container.querySelector('[data-mount-slot] [data-content]')?.textContent).toBe(
			'Loaded',
		);

		setLatency(latencyMs);
		const start = performance.now();
		container.querySelector<HTMLButtonElement>('[data-add]')!.click();
		await expect.poll(() => container.querySelector('[data-row-slot]')).not.toBeNull();
		const slot = container.querySelector('[data-row-slot]') as HTMLElement;
		const samples = await sample(slot, start, latencyMs + 1_000);
		const result = metrics(samples);
		console.log('ROW', latencyMs, JSON.stringify(result));

		expect(result.blankMs).toBeLessThan(100);
		expect(result.pendingFlashes).toBeLessThanOrEqual(1);
		expect(result.timeToCorrectMs).toBeGreaterThan(latencyMs - 20);
	});
}
