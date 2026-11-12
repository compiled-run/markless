import { waitAt } from './gates.ts';

export type Todo = { readonly id: number; readonly title: string };

const store = globalThis as typeof globalThis & { __formTodos?: Todo[]; __formHeldReads?: number };

export function todosOnServer(): Todo[] {
	return (store.__formTodos ??= [{ id: 1, title: 'Write the report' }]);
}

export function addTodoOnServer(title: string): void {
	const todos = todosOnServer();
	todos.push({ id: todos.length + 1, title });
}

// The next read waits at the "read" gate, so a test sees the form stay busy until the refresh lands.
export function holdNextRead(): void {
	store.__formHeldReads = (store.__formHeldReads ?? 0) + 1;
}

export async function readGate(): Promise<void> {
	if (!store.__formHeldReads) return;
	store.__formHeldReads--;
	await waitAt('read');
}

export async function loadTodos(): Promise<Todo[]> {
	if (typeof window === 'undefined') return [...todosOnServer()];
	const response = await fetch('/api/todos', { cache: 'no-store' });
	if (!response.ok) throw new Error(`todos: ${response.status}`);
	return (await response.json()) as Todo[];
}

export async function loadFlash(): Promise<string> {
	if (typeof window === 'undefined') return '';
	return (await fetch('/api/flash', { cache: 'no-store' })).text();
}
