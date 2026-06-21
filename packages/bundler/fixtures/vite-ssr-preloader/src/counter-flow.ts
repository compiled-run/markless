import { counterStep } from './counter-step.ts';

export function nextCount(value: number): number {
	queueCounterWarmups();
	return value + counterStep();
}

function queueCounterWarmups(): void {
	void import('./counter-history.ts');
	void import('./counter-label.ts');
	void import('./counter-metrics.ts');
}
