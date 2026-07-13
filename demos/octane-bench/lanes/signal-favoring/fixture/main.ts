import { render } from '@markless/web';
import type { CsrRenderContainer } from '@markless/web';
import App from './app.tsrx';

const ownerLevels = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91] as const;
const target = document.querySelector('#app');
if (!target) throw new Error('signal-favoring fixture requires #app');

let container: CsrRenderContainer | undefined;
const evaluationCounts = new Uint32Array(101);
globalThis.__signalEvaluationCounts = evaluationCounts;

function resetEvaluationCounters(): void {
	evaluationCounts.fill(0);
}

function readEvaluationCounters(): number[] {
	return Array.from(evaluationCounts);
}

async function mount(): Promise<void> {
	if (container) throw new Error('signal-favoring fixture is already mounted');
	container = await render(App, { target });
}

async function flush(): Promise<void> {
	if (!container) throw new Error('signal-favoring fixture is not mounted');
	await container.graph.flush();
}

function click(selector: string): void {
	const button = target.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`signal-favoring action is missing: ${selector}`);
	button.click();
}

// Every owner write flows into the deepest output (value100 sums all owner
// contributions), so waiting for its text to reach an expected value is an
// event-driven commit barrier that also verifies content. graph.flush() is
// not a commit barrier for dispatched clicks, and a click dispatched while
// a prior propagation is in flight is dropped, so sequential sweeps MUST
// wait out each commit (that is also octane's sequential-sweep semantics).
function deepestText(): string {
	const node = target.querySelector("[data-value='100']");
	if (!node) throw new Error('signal-favoring deepest output is missing');
	return node.textContent ?? '';
}

function untilDeepest(expected: string, timeoutMs = 15_000): Promise<void> {
	return new Promise((resolve, reject) => {
		if (deepestText() === expected) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			observer.disconnect();
			reject(new Error(`signal-favoring deepest output never reached ${expected} (at ${deepestText()})`));
		}, timeoutMs);
		const observer = new MutationObserver(() => {
			if (deepestText() !== expected) return;
			clearTimeout(timer);
			observer.disconnect();
			resolve();
		});
		observer.observe(target, { characterData: true, childList: true, subtree: true });
	});
}

async function write(level: number): Promise<void> {
	const expected = String(Number(deepestText()) + 1);
	click(`[data-owner="${level}"]`);
	await untilDeepest(expected);
}

async function sweep(levels: readonly number[], flushEach: boolean): Promise<void> {
	if (flushEach) {
		for (const level of levels) await write(level);
		return;
	}
	const expected = String(Number(deepestText()) + levels.length);
	for (const level of levels) click(`[data-owner="${level}"]`);
	await flush();
	await untilDeepest(expected);
}

const api = {
	mount,
	async unmount() {
		if (!container) return;
		(container.runtime as { dispose?: () => void }).dispose?.();
		target.replaceChildren();
		container = undefined;
	},
	async write(level: number) { await write(level); },
	async equalWrite() { click('[data-equal="1"]'); await flush(); },
	async forwardSweep() { await sweep(ownerLevels, true); },
	async batchedForwardSweep() { await sweep(ownerLevels, false); },
	async reverseSweep() { await sweep([...ownerLevels].reverse(), false); },
	resetEvaluationCounters,
	readEvaluationCounters,
	ownerLevels: [...ownerLevels],
};

declare global {
	interface Window {
		__signalFavoringBench: typeof api;
		__ready: boolean;
	}
	var __signalEvaluationCounts: Uint32Array;
}

window.__signalFavoringBench = api;
window.__ready = true;
