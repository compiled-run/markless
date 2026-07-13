import { state } from '@markless/core';
import {
	addTodo,
	applyFilter,
	cancelEditing,
	clearCompleted,
	destroyTodo,
	editTodoFromKeyboard,
	remainingTodos,
	startEditing,
	toggleAll,
	toggleTodo,
	visibleTodos,
	type Todo,
	type TodoFilter,
} from './data.ts';

// Todo visibility and edit mode travel in row data. Render expressions inside
// the keyed loop therefore read only the current todo.
export function App() @{
	let todos = state<Todo[]>([]);
	let rows = state<Todo[]>([]);
	let filter = state<TodoFilter>('all');
	let nextId = state(1);
	let remaining = state(0);
	let completed = state(0);

	<section class="todoapp">
		<header class="header">
			<h1>todos</h1>
			<input class="new-todo" placeholder="What needs to be done?" onKeyDown={(event: KeyboardEvent) => {
				if (event.key === 'Enter') {
					const input = event.target as HTMLInputElement;
					const title = input.value.trim();
					if (title !== '') {
						todos = addTodo(todos, nextId, title, filter);
						rows = visibleTodos(todos, filter);
						nextId++;
						remaining = remainingTodos(todos);
						completed = todos.length - remaining;
						input.value = '';
					}
				}
			}} />
		</header>
		<section class="main">
			<input id="toggle-all" class="toggle-all" type="checkbox" onClick={(event: Event) => {
				const checked = (event.target as HTMLInputElement).checked;
				todos = toggleAll(todos, checked, filter);
				rows = visibleTodos(todos, filter);
				remaining = remainingTodos(todos);
				completed = todos.length - remaining;
			}} />
			<ul class="todo-list">
				@for (todo of rows; key todo.id) {
					<li>
						<span class="todo-id">{todo.id}</span>
						<span class="todo-completed">{todo.completed}</span>
						<span class="todo-editing">{todo.editing}</span>
							<div class="view">
								<input class="toggle" type="checkbox" onClick={() => {
									todos = toggleTodo(todos, todo.id, filter);
									rows = visibleTodos(todos, filter);
									remaining = remainingTodos(todos);
									completed = todos.length - remaining;
								}} />
								<label onDblClick={() => { todos = startEditing(todos, todo.id); rows = visibleTodos(todos, filter); }}>{todo.title}</label>
								<button class="destroy" onClick={() => {
									todos = destroyTodo(todos, todo.id);
									rows = visibleTodos(todos, filter);
									remaining = remainingTodos(todos);
									completed = todos.length - remaining;
								}}></button>
							</div>
							<input class="edit" onKeyDown={(event: KeyboardEvent) => {
									todos = editTodoFromKeyboard(todos, todo.id, event);
									rows = visibleTodos(todos, filter);
									remaining = remainingTodos(todos);
									completed = todos.length - remaining;
								}} />
						</li>
				}
			</ul>
		</section>
		<footer class="footer">
			<span class="todo-count">Items left</span>
			<ul class="filters">
				<li><a data-filter="all" onClick={() => { filter = 'all'; todos = applyFilter(todos, filter); rows = visibleTodos(todos, filter); }}>All</a></li>
				<li><a data-filter="active" onClick={() => { filter = 'active'; todos = applyFilter(todos, filter); rows = visibleTodos(todos, filter); }}>Active</a></li>
				<li><a data-filter="completed" onClick={() => { filter = 'completed'; todos = applyFilter(todos, filter); rows = visibleTodos(todos, filter); }}>Completed</a></li>
			</ul>
			<button class="clear-completed" onClick={() => { todos = clearCompleted(todos); rows = visibleTodos(todos, filter); remaining = remainingTodos(todos); completed = 0; }}>Clear completed</button>
		</footer>
	</section>
}
