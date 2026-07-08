import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ResettleDeadline from './fixtures/resettle-deadline.tsrx';

// T119/T120 deadline-gated @pending on RE-settles, frame-sampled. A refresh
// slower than the client deadline (~250ms) first HOLDS the prior settled
// content, then commits the boundary's @pending arm, honors the pending
// minimum duration, and finally commits the fresh settled content. Ordering
// and lower-bound assertions only — exact timing semantics are property-
// tested under the fake clock in packages/web/test/resettle-hold-timing.test.ts.
afterEach(() => cleanup());

test('a slow re-settle shows the @pending arm only past the deadline, then settles', async () => {
	const screen = await render(ResettleDeadline);
	const container = screen.container as HTMLElement;

	// First appearance settles (structural @pending is legitimate here).
	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent, { timeout: 5_000 })
		.toBe('Report alpha');

	// Record every DOM state transition (with timestamps) during the refresh.
	const samples: { html: string; at: number }[] = [];
	const observer = new MutationObserver(() =>
		samples.push({ html: container.innerHTML, at: performance.now() }),
	);
	observer.observe(container, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});

	const refresh = container.querySelector<HTMLButtonElement>('button[data-refresh]');
	if (!refresh) throw new Error('Expected the refresh button in the rendered DOM.');
	const clickedAt = performance.now();
	refresh.click();

	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent, { timeout: 5_000 })
		.toBe('Report beta');
	observer.disconnect();

	const pendingIndex = samples.findIndex((sample) => sample.html.includes('class="pending"'));
	// The deadline passed while the refresh was still pending: the @pending
	// arm MUST have been committed.
	expect(
		pendingIndex,
		'expected the @pending arm to appear past the deadline',
	).toBeGreaterThanOrEqual(0);

	// …but never before the deadline: timers only fire late, so the pending
	// frame appears no earlier than (deadline - scheduling margin).
	expect(samples[pendingIndex]!.at - clickedAt).toBeGreaterThanOrEqual(200);

	for (const [index, sample] of samples.entries()) {
		// Until the pending commit, the prior settled content holds — no blank
		// range, no premature arm swap.
		if (index < pendingIndex) expect(sample.html).toContain('Report alpha');
		// Never a blank boundary: either a settled report or the pending arm.
		expect(/Report |class="pending"/.test(sample.html), `blank frame at ${String(index)}`).toBe(
			true,
		);
	}

	// Min-duration lower bound: once shown, pending stays visible at least
	// ~200ms before the settled commit replaces it (150ms margin for jitter).
	const settledIndex = samples.findIndex(
		(sample, index) => index > pendingIndex && sample.html.includes('Report beta'),
	);
	expect(settledIndex).toBeGreaterThan(pendingIndex);
	expect(samples[settledIndex]!.at - samples[pendingIndex]!.at).toBeGreaterThanOrEqual(150);
});
