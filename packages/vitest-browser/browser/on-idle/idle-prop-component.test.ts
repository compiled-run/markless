import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import PropPage from './prop-page.tsrx';

// A component handed to another as a prop value and rendered there still gets its onIdle run.
function holdIdle() {
	const queued: Array<() => void> = [];
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({
			frame: (run: () => void) => run(),
			idle: (run: () => void) => queued.push(run),
		}),
	});
	return {
		get pending() {
			return queued.length;
		},
		release() {
			for (const run of queued.splice(0)) run();
		},
		restore() {
			delete (Element.prototype as { __mClock?: unknown }).__mClock;
		},
	};
}

let idle: ReturnType<typeof holdIdle> | undefined;
afterEach(() => {
	idle?.restore();
	idle = undefined;
	cleanup();
});

// Open: a component passed as a prop value does not render yet, on the server or in the browser.
test.fails('SSR: onIdle in a component passed as a prop value runs after idle', async () => {
	idle = holdIdle();
	const { container } = await renderSSR(PropPage);
	const ticks = () => container.querySelector('[data-frame] output[data-ticks]')?.textContent;
	expect(ticks()).toBe('0');
	await expect
		.poll(() => {
			idle!.release();
			return ticks();
		})
		.toBe('1');
});
