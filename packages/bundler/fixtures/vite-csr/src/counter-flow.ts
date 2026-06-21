import { counterStep } from './counter-step.ts';

const globalScope = globalThis as typeof globalThis & {
	__arcadeCsrLazyModuleEvaluations?: number;
};

globalScope.__arcadeCsrLazyModuleEvaluations =
	(globalScope.__arcadeCsrLazyModuleEvaluations ?? 0) + 1;
if (typeof document !== 'undefined') {
	document.dispatchEvent(new Event('arcade:csr-lazy-module-evaluated'));
}

export function nextCount(value: number): number {
	queueCounterWarmups();
	return value + counterStep();
}

function queueCounterWarmups(): void {
	void import('./counter-history.ts');
	void import('./counter-label.ts');
}
