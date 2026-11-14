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

type Saves = typeof globalThis & { __saves?: Promise<void> };

export async function loadEdits(filter: string, reload: number, descending: boolean, dropped: number): Promise<Todo[]> {
	const todos = (await loadTodos(filter, reload)).filter((todo) => todo.id !== dropped);
	return descending ? [...todos].reverse() : todos;
}

// A test may hold every save until it has changed the rows under it.
export async function saveEdit(id: number): Promise<number> {
	await (globalThis as Saves).__saves;
	return id;
}
