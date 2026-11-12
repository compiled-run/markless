import { computed, state } from '@markless/core';
import { SavingRow, TodoRow } from './row.tsrx';
import { addTodo, loadShelf } from './server.ts';

export default function ComponentRowsPage() @{
	const shelf = computed(async () => await loadShelf());
	let sending = state<string | null>(null);

	<main>
		@try {
			<section>
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
				<ul>
					@for (const todo of shelf.todos; key todo.id) {
						<TodoRow title={todo.title} />
					}
					<SavingRow title={sending} />
				</ul>
			
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
