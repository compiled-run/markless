export type Todo = { readonly id: number; readonly title: string };

const store = globalThis as typeof globalThis & { __formTodos?: Todo[]; __formSlowReads?: number };

export function todosOnServer(): Todo[] {
	return (store.__formTodos ??= [{ id: 1, title: 'Write the report' }]);
}

export function addTodoOnServer(title: string): void {
	const todos = todosOnServer();
	todos.push({ id: todos.length + 1, title });
}

// The next read waits, so a test can see the form stay busy until the refresh lands.
export function slowNextRead(): void {
	store.__formSlowReads = (store.__formSlowReads ?? 0) + 1;
}

export async function readDelay(): Promise<void> {
	if (!store.__formSlowReads) return;
	store.__formSlowReads--;
	await new Promise((resolve) => setTimeout(resolve, 800));
}

export async function loadTodos(): Promise<Todo[]> {
	if (typeof window === 'undefined') return [...todosOnServer()];
	const response = await fetch('/api/todos', { cache: 'no-store' });
	if (!response.ok) throw new Error(`todos: ${response.status}`);
	return (await response.json()) as Todo[];
}
