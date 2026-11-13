export type Todo = { readonly id: number; readonly title: string; readonly done: boolean };

const todos: ReadonlyArray<Todo> = [
	{ id: 1, title: 'Write the fill plan', done: true },
	{ id: 2, title: 'Measure the load', done: false },
	{ id: 3, title: 'Show the owner', done: false },
];

export function getTodos(filter: string): Promise<ReadonlyArray<Todo>> {
	const counter = globalThis as { __todoFetches?: number };
	counter.__todoFetches = (counter.__todoFetches ?? 0) + 1;
	return new Promise((resolve) =>
		setTimeout(
			() => resolve(todos.filter((todo) => filter === 'all' || (filter === 'done') === todo.done)),
			50,
		),
	);
}
