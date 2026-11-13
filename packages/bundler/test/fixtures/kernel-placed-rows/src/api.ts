export type Todo = { readonly id: number; readonly name: string };

type Gated = typeof globalThis & { __answers?: Promise<void> };

// A test may hold every answer until it has measured the page at rest.
export async function loadTodos(filter: string, reload: number): Promise<Todo[]> {
	await (globalThis as Gated).__answers;
	await new Promise((resolve) => setTimeout(resolve, 10));
	return [
		{ id: 1, name: 'Dune' },
		{ id: 2, name: 'Emma' },
		{ id: 3, name: `Ubik ${reload}` },
	].filter((todo) => todo.name.toLowerCase().includes(filter));
}
