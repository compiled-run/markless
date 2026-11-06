// Mock save/list API for the optimistic-row proof. Call counts and the
// SSR-call count are read directly by tests; there is no network involved.
export type Draft = { id: string; title: string };
export type Todo = { id: string; title: string; done: boolean };

type Behavior = { delayMs: number; fail: boolean };

const behaviors = new Map<string, Behavior>();
const saveLog: { id: string; title: string; at: number }[] = [];
const toggleLog: { id: string; done: boolean; at: number }[] = [];
let ssrSaveCalls = 0;
let seq = 0;

const confirmedStore = new Map<string, Todo>([['seed-1', { id: 'seed-1', title: 'Write report', done: false }]]);

export function configureSave(id: string, behavior: Partial<Behavior>) {
	behaviors.set(id, { delayMs: behavior.delayMs ?? 10, fail: behavior.fail ?? false });
}

export function resetSaveApi() {
	behaviors.clear();
	saveLog.length = 0;
	toggleLog.length = 0;
	ssrSaveCalls = 0;
	seq = 0;
	confirmedStore.clear();
	confirmedStore.set('seed-1', { id: 'seed-1', title: 'Write report', done: false });
}

export function saveCalls(id?: string) {
	return id ? saveLog.filter((call) => call.id === id) : saveLog.slice();
}

export function ssrCallCount() {
	return ssrSaveCalls;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveTodo(draft: Draft): Promise<Todo> {
	saveLog.push({ id: draft.id, title: draft.title, at: seq++ });
	// A real mutation would hit the network from the browser only; this
	// counter is the proof that it never runs during server rendering.
	if (typeof window === 'undefined') ssrSaveCalls += 1;
	// The id is only known after submit; configureSave by title lets a test set
	// behavior before a draft's id exists. id wins if both are set.
	const behavior = behaviors.get(draft.id) ?? behaviors.get(draft.title) ?? { delayMs: 10, fail: false };
	await wait(behavior.delayMs);
	if (behavior.fail) throw new Error(`save failed: ${draft.title}`);
	const todo: Todo = { id: draft.id, title: draft.title, done: false };
	confirmedStore.set(draft.id, todo);
	return todo;
}

export async function listTodos(): Promise<Todo[]> {
	await wait(5);
	return [...confirmedStore.values()];
}

export async function toggleTodo(id: string, done: boolean): Promise<Todo> {
	toggleLog.push({ id, done, at: seq++ });
	if (typeof window === 'undefined') ssrSaveCalls += 1;
	const behavior = behaviors.get(id) ?? { delayMs: 10, fail: false };
	await wait(behavior.delayMs);
	if (behavior.fail) throw new Error(`toggle failed: ${id}`);
	const existing = confirmedStore.get(id) ?? { id, title: id, done: false };
	const next = { ...existing, done };
	confirmedStore.set(id, next);
	return next;
}

export function toggleCalls(id?: string) {
	return id ? toggleLog.filter((call) => call.id === id) : toggleLog.slice();
}
