import { state } from '@markless/core';
import { addTodo, clearCompleted, initialTodos, type Todo } from './data.ts';

export function App() @{
	let todos = state<Todo[]>([]);

	<section class="todoapp">
		<header class="header">
			<h1>todos</h1>
			<input class="new-todo" value="New todo" placeholder="What needs to be done?" />
			<button type="button" onClick={() => { todos = initialTodos(); }}>Load todos</button>
			<button type="button" onClick={() => { todos = addTodo(todos, 'New todo'); }}>Add todo</button>
		</header>
		<section class="main"><ul class="todo-list">
			@for (todo of todos; key todo.id) {
				<li><span>{todo.title}</span><small>{todo.id}</small></li>
			}
		</ul></section>
		<footer class="footer"><span class="todo-count">Items remain</span><button class="clear-completed" onClick={() => { todos = clearCompleted(todos); }}>Clear completed</button></footer>
	</section>
}
