import { state } from '@markless/core';
import { saveTodo, type Todo } from './save.ts';

export default function TodoList({ todos }: { todos: Array<Todo> }) @{
	let draft = state('');
	let sending = state<string | null>(null);

	<div>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const text = draft.trim();
				if (!text) return;
				draft = '';
				sending = text;
				try {
					await saveTodo(text);
				} finally {
					sending = null;
				}
			}}
		>
			<input value={draft} onInput={(event) => (draft = event.target.value)} />
			<button type="submit">Add</button>
		</form>
		<ul>
			@for (const todo of todos; key todo.id) {
				<li>{todo.text}</li>
			}
			@if (sending !== null) {
				<li data-saving>{sending} (saving)</li>
			}
		</ul>
	</div>
}
