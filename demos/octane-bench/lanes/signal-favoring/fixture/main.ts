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

async function write(level: number): Promise<void> {
	click(`[data-owner="${level}"]`);
	await flush();
}

async function sweep(levels: readonly number[], flushEach: boolean): Promise<void> {
	for (const level of levels) {
		click(`[data-owner="${level}"]`);
		if (flushEach) await flush();
	}
	if (!flushEach) await flush();
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
