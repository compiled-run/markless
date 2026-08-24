import { shared, state } from '@markless/core';

// Minimal repro for the timer-callback write defect. `start()` is a shared
// factory method whose body assigns the interval handle to a graph cell, and the
// callback it hands to setInterval writes another cell on every tick. That tick
// write used to be emitted as `context.graph.read(...) = ...`: a module that
// parses and throws `Invalid left-hand side in assignment` on every tick, which
// is what stopped carousel autoplay from advancing.
export const ticker = shared(
	() => {
		const t = state({ count: 0, timer: 0, stopped: false });

		return {
			...t,
			// literal function type: a callback slot is only recognised from the
			// written annotation
			onTick: undefined as ((count: number) => void) | undefined,
			start() {
				if (t.timer !== 0) window.clearInterval(t.timer);
				t.timer = window.setInterval(() => {
					t.count = t.count + 1;
					// A filled callback slot becomes `await context.capture.invoke(...)`,
					// so this callback has to be emitted `async` or the module is a
					// SyntaxError in module goal. This is the carousel's own
					// `onChange?.(next)` shape.
					t.onTick?.(t.count);
				}, 20);
			},
			stop() {
				if (t.timer !== 0) window.clearInterval(t.timer);
				t.timer = 0;
				t.stopped = true;
			},
			once() {
				t.timer = window.setTimeout(() => {
					t.count = t.count + 10;
				}, 20);
			},
		};
	},
	{ scope: 'widget' },
);

function TickerRoot({ onTick }) @{
	const t = ticker();
	t.onTick = onTick;

	<div data-ticker>
		<button type="button" data-ticker-start onClick={() => t.start()}>start</button>
		<button type="button" data-ticker-stop onClick={() => t.stop()}>stop</button>
		<button type="button" data-ticker-once onClick={() => t.once()}>once</button>
		<output data-ticker-count>{t.count}</output>
		<output data-ticker-stopped>{t.stopped}</output>
	</div>
}

export default function App() @{
	let heard = state(-1);

	<section data-ticker-page>
		<TickerRoot onTick={(count) => heard = count} />
		<output data-ticker-heard>{heard}</output>
	</section>
}
