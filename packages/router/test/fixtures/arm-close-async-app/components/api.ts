// The page's loads, held open until the test settles them; the test reads them off the page.
type Waiting = { readonly id: number; readonly settle: () => void };

const waiting: Waiting[] = [];
const subjectLog: Array<number | null> = [];
const labelLog: number[] = [];
let duringLabel: (() => void) | undefined;

if (typeof document !== 'undefined')
	(globalThis as { armClose?: unknown }).armClose = {
		subjectLog,
		labelLog,
		waitingFor: (id: number) => waiting.filter((load) => load.id === id).length,
		settleAll(id: number) {
			for (const load of waiting.filter((candidate) => candidate.id === id)) {
				waiting.splice(waiting.indexOf(load), 1);
				load.settle();
			}
		},
	};

export function loadSubject(id: number, round: number): Promise<{ name: string }> {
	if (typeof document === 'undefined') return Promise.resolve({ name: `subject ${id} round ${round}` });
	subjectLog.push(id);
	return new Promise((resolve) => {
		waiting.push({ id, settle: () => resolve({ name: `subject ${id} round ${round}` }) });
	});
}

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
