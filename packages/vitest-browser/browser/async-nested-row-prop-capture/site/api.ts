export type Draft = { id: string; title: string };
export type Todo = { id: string; title: string };

const saveLog: { id: string; title: string | undefined }[] = [];
let todos: Todo[] = [{ id: 'seed-1', title: 'Write report' }];

export function resetSiteApi() {
	saveLog.length = 0;
	todos = [{ id: 'seed-1', title: 'Write report' }];
}

export function siteSaveCalls() {
	return saveLog.slice();
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listTodos(reload: number): Promise<Todo[]> {
	await wait(5);
	return todos.map((todo) => ({ ...todo, title: reload > 0 ? `${todo.title} (checked)` : todo.title }));
}

export async function saveTodo(draft: Draft | undefined): Promise<Todo> {
	saveLog.push({ id: draft?.id ?? '(no id)', title: draft?.title });
	await wait(20);
	if (!draft) throw new Error('saveTodo received no draft');
	const todo = { id: draft.id, title: draft.title };
	todos = [...todos, todo];
	return todo;
}
