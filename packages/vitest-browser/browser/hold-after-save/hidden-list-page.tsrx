import { computed, state } from '@markless/core';
import { addTodo, loadShelf } from './server.ts';

export default function HiddenListPage() @{
	const shelf = computed(async () => await loadShelf());
	let showList = state(true);
	let sending = state<string | null>(null);

	<main>
		<button data-hide onClick={() => (showList = false)}>Hide</button>
		<button
			data-add
			onClick={async () => {
				sending = 'Bread';
				try {
					await addTodo('Bread');
				} finally {
					sending = null;
				}
			}}
		>
			Add
		</button>
		<p data-outside>{sending ?? 'idle'}</p>
		@if (showList) {
			@try {
				<ul>
					@for (const todo of shelf.todos; key todo.id) {
						<li data-todo>{todo.title}</li>
					}
				</ul>
			} @pending {
				<p>Loading</p>
			}
		}
	</main>
}
