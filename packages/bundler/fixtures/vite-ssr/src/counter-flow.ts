import { counterStep } from './counter-step.ts';

export function nextCount(value: number): number {
	queueCounterWarmups();
	return value + counterStep();
}

function queueCounterWarmups(): void {
	void import('/src/counter-history.ts');
	void import('/src/counter-label.ts');
}
