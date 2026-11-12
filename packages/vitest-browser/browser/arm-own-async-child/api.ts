type Waiting = { readonly id: number; readonly settle: (fail: boolean) => void };

const waiting: Waiting[] = [];

/** Every subject a panel asked for, in order; a closed panel asking shows up here. */
export const subjectLog: Array<number | null> = [];
export const labelLog: Array<number | null> = [];

export function resetLoads(): void {
	waiting.length = 0;
	subjectLog.length = 0;
	labelLog.length = 0;
	duringLabel = undefined;
}

export function waitingFor(id: number): number {
	return waiting.filter((load) => load.id === id).length;
}

/** Settles every load still waiting for `id`. */
export function settleAll(id: number, fail = false): void {
	for (const load of waiting.filter((candidate) => candidate.id === id)) {
		waiting.splice(waiting.indexOf(load), 1);
		load.settle(fail);
	}
}

export function loadSubject(id: number, round: number): Promise<{ name: string }> {
	if (typeof document === 'undefined') return Promise.resolve({ name: `subject ${id} round ${round}` });
	subjectLog.push(id);
	return new Promise((resolve, reject) => {
		waiting.push({
			id,
			settle: (fail) =>
				fail ? reject(new Error(`subject ${id} failed`)) : resolve({ name: `subject ${id} round ${round}` }),
		});
	});
}

let duringLabel: (() => void) | undefined;

/** Resolves the next time a label derives in the browser: inside the render that opens its panel. */
export function nextLabel(): Promise<void> {
	return new Promise((resolve) => (duringLabel = resolve));
}

export function recordLabel(id: number, count: number): string {
	if (typeof document !== 'undefined') {
		labelLog.push(id);
		const run = duringLabel;
		duringLabel = undefined;
		run?.();
	}
	return `label ${id} ${count}`;
}
