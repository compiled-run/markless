import { afterEach, expect, test } from 'vitest';
import { renderSSR } from '../../src/index.ts';
import ClickOnly from './click-only.tsrx';
import IdleGesture from './idle-gesture.tsrx';
import VisibleGesture from './visible-gesture.tsrx';

const host = globalThis as typeof globalThis & { __deferLog?: string[] };
const queued: Array<() => void> = [];

function holdIdle() {
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({
			frame: (run: () => void) => run(),
			idle: (run: () => void) => queued.push(run),
		}),
	});
}

afterEach(() => {
	delete (Element.prototype as { __mClock?: unknown }).__mClock;
	queued.length = 0;
	delete host.__deferLog;
});

// The base resumer walks the container once; a deferred lane must add no walk of its own at load.
async function nodesVisitedAtLoad(mount: () => Promise<unknown>): Promise<number> {
	const nextNode = TreeWalker.prototype.nextNode;
	let visits = 0;
	TreeWalker.prototype.nextNode = function (this: TreeWalker) {
		visits++;
		return nextNode.call(this);
	};
	try {
		await mount();
	} finally {
		TreeWalker.prototype.nextNode = nextNode;
	}
	return visits;
}

test('visible and idle lanes visit no nodes at load', async () => {
	holdIdle();
	const plain = await nodesVisitedAtLoad(() => renderSSR(ClickOnly));
	const idle = await nodesVisitedAtLoad(() => renderSSR(IdleGesture));
	const visible = await nodesVisitedAtLoad(() => renderSSR(VisibleGesture));
	expect(plain).toBeGreaterThan(0);
	expect(idle).toBe(plain);
	expect(visible).toBe(plain);
});

test('once an idle handler has started the page, a click reaches its dispatch queue before the next task', async () => {
	holdIdle();
	const { container } = await renderSSR(IdleGesture);
	await expect
		.poll(() => {
			for (const run of queued.splice(0)) run();
			return host.__deferLog?.join() ?? '';
		})
		.toBe('idle');
	const root = container.querySelector('[data-async-container]') as HTMLElement & {
		__marklessDispatch?: (input: { readonly event?: Event }) => unknown;
	};
	await expect.poll(() => typeof root.__marklessDispatch).toBe('function');
	const queue = root.__marklessDispatch!;
	const arrivals: string[] = [];
	root.__marklessDispatch = (input) => {
		arrivals.push(input.event?.type ?? 'none');
		return queue(input);
	};
	const button = container.querySelector<HTMLButtonElement>('button[data-press]')!;
	await new Promise((done) => {
		button.click();
		setTimeout(done);
	});
	expect(arrivals).toEqual(['click']);
	await expect.poll(() => host.__deferLog?.join()).toBe('idle,click');
});

test('a gesture made while an idle callback is pending runs first and is not dropped', async () => {
	holdIdle();
	const { container } = await renderSSR(IdleGesture);
	await expect.poll(() => queued.length).toBeGreaterThan(0);
	container.querySelector<HTMLButtonElement>('button[data-press]')!.click();
	for (const run of queued.splice(0)) run();
	await expect
		.poll(() => {
			for (const run of queued.splice(0)) run();
			return host.__deferLog?.length ?? 0;
		})
		.toBe(2);
	expect(host.__deferLog).toEqual(['click', 'idle']);
});
