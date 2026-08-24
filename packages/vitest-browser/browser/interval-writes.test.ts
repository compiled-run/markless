import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TickerApp from './fixtures/interval-writes.tsrx';

// Defect 79. A graph write inside a `setInterval`/`setTimeout` callback that is
// itself the VALUE of another graph write used to be emitted as
// `context.graph.read("state:t", ["count"]) = ...`. That parses, so the compiler
// shipped it, and every tick threw `Invalid left-hand side in assignment` —
// which is why carousel autoplay never advanced.
//
// The witness is the DOM, not the compiler: a tick has to reach the graph for
// `<output>` to change, so a green count here means the write went through the
// graph and refreshed subscribed text.
afterEach(() => cleanup());

function countOf(container: ParentNode): string | null | undefined {
	return container.querySelector('[data-ticker-count]')?.textContent;
}

async function expectTicksAdvanceTheDom(container: ParentNode) {
	const errors: string[] = [];
	const onError = (event: ErrorEvent) => void errors.push(String(event.error ?? event.message));
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		errors.push(String(event.reason));
	};
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);

	try {
		expect(countOf(container)).toBe('0');

		container.querySelector<HTMLButtonElement>('[data-ticker-start]')?.click();
		// Two ticks, so this cannot pass on a single write that happened to land.
		await expect.poll(() => Number(countOf(container)), { timeout: 4000 }).toBeGreaterThan(1);

		container.querySelector<HTMLButtonElement>('[data-ticker-stop]')?.click();
		await expect
			.poll(() => container.querySelector('[data-ticker-stopped]')?.textContent)
			.toBe('true');

		const stoppedAt = Number(countOf(container));
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(Number(countOf(container))).toBe(stoppedAt);

		// The setTimeout twin of the same shape: one write, +10, once.
		container.querySelector<HTMLButtonElement>('[data-ticker-once]')?.click();
		await expect
			.poll(() => Number(countOf(container)), { timeout: 4000 })
			.toBe(stoppedAt + 10);

		// The old failure was a throw out of the timer callback, so an empty error
		// log is part of the proof rather than decoration. The tick also invokes a
		// filled callback slot, which the band emits as `await
		// context.capture.invoke(...)`: the callback the author wrote was not async,
		// so the timer callback has to be emitted `async` or the module is a
		// SyntaxError in module goal and nothing below would run at all.
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	}
}

test('CSR: an interval callback write advances the DOM on every tick', async () => {
	const screen = await render(TickerApp);
	await expectTicksAdvanceTheDom(screen.container as HTMLElement);
});

test('SSR: an interval callback write advances the DOM after resume', async () => {
	const screen = await renderSSR(TickerApp);
	await expectTicksAdvanceTheDom(screen.container);
});

// A SEPARATE defect, measured while pinning defect 79 and not fixed here: the
// tick's `t.onTick?.(t.count)` compiles to
// `await (context.capture ? context.capture.invoke("...") : undefined)`, and at
// tick time `context.capture` is not there, so the guard takes the `undefined`
// arm and the parent is never told. Nothing reports it — the count still
// advances, so only the parent's own output shows the loss. The compiled bytes
// are correct (`packages/compiler/test/interval-callback-writes.test.ts` pins
// the emitted invoke), so this is a runtime-route defect, not an emission one.
// When it lands, this row turns red: drop `.fails`.
test.fails('a callback slot invoked from a timer tick reaches the parent', async () => {
	const screen = await render(TickerApp);
	const container = screen.container as HTMLElement;

	expect(container.querySelector('[data-ticker-heard]')?.textContent).toBe('-1');
	container.querySelector<HTMLButtonElement>('[data-ticker-start]')?.click();
	try {
		await expect.poll(() => Number(countOf(container)), { timeout: 4000 }).toBeGreaterThan(0);
		await expect
			.poll(
				() => Number(container.querySelector('[data-ticker-heard]')?.textContent),
				{ timeout: 2000 },
			)
			.toBeGreaterThan(0);
	} finally {
		// The rotation outlives a failed assertion otherwise, and keeps ticking
		// against a container the next test has already torn down.
		container.querySelector<HTMLButtonElement>('[data-ticker-stop]')?.click();
	}
});
