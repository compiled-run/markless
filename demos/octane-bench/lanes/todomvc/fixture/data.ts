export type Todo = {
	id: number;
	title: string;
	completed: boolean;
	hidden: boolean;
	editing: boolean;
};

export type TodoFilter = 'all' | 'active' | 'completed';

export function addTodo(todos: Todo[], id: number, title: string, filter: TodoFilter): Todo[] {
	const completed = false;
	return [...todos, { id, title, completed, editing: false, hidden: filter === 'completed' }];
}

export function toggleTodo(todos: Todo[], id: number, filter: TodoFilter): Todo[] {
	return todos.map((todo) => {
		if (todo.id !== id) return todo;
		const completed = !todo.completed;
		return { ...todo, completed, hidden: isHidden(completed, filter) };
	});
}

export function toggleAll(todos: Todo[], completed: boolean, filter: TodoFilter): Todo[] {
	return todos.map((todo) => ({ ...todo, completed, hidden: isHidden(completed, filter) }));
}

export function applyFilter(todos: Todo[], filter: TodoFilter): Todo[] {
	return todos.map((todo) => ({ ...todo, hidden: isHidden(todo.completed, filter) }));
}

export function visibleTodos(todos: Todo[], filter: TodoFilter): Todo[] {
	return todos.filter((todo) => !isHidden(todo.completed, filter));
}

export function startEditing(todos: Todo[], id: number): Todo[] {
	return todos.map((todo) => ({ ...todo, editing: todo.id === id }));
}

export function finishEditing(todos: Todo[], id: number, title: string): Todo[] {
	if (title === '') return destroyTodo(todos, id);
	return todos.map((todo) => todo.id === id ? { ...todo, title, editing: false } : todo);
}

export function editTodoFromKeyboard(todos: Todo[], id: number, event: KeyboardEvent): Todo[] {
	if (event.key === 'Escape') return cancelEditing(todos);
	if (event.key !== 'Enter') return todos;
	return finishEditing(todos, id, (event.target as HTMLInputElement).value.trim());
}

export function cancelEditing(todos: Todo[]): Todo[] {
	return todos.map((todo) => todo.editing ? { ...todo, editing: false } : todo);
}

export function destroyTodo(todos: Todo[], id: number): Todo[] {
	return todos.filter((todo) => todo.id !== id);
}

export function clearCompleted(todos: Todo[]): Todo[] {
	return todos.filter((todo) => !todo.completed);
}

export function remainingTodos(todos: Todo[]): number {
	return todos.reduce((count, todo) => count + (todo.completed ? 0 : 1), 0);
}

function isHidden(completed: boolean, filter: TodoFilter): boolean {
	return filter === 'active' ? completed : filter === 'completed' ? !completed : false;
}
