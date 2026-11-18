import { computed, state } from '@markless/core';
import { loadShelf, remove } from './server.ts';

export default function DeletePage() @{
	const shelf = computed(async () => await loadShelf());
	let removing = state<string | null>(null);
	const kept = computed(() => shelf.todos.filter((todo) => todo.id !== removing));

	<main>
		@try {
			<section>
				<span data-server>{shelf.todos.length}</span>
				<ul>
					@for (const todo of kept; key todo.id) {
						<li data-todo>
							{todo.title}
							<button
								data-delete
								onClick={async () => {
									removing = todo.id;
									try {
										await remove(todo.id);
									} finally {
										removing = null;
									}
								}}
							>
								Delete
							</button>
						</li>
					}
				</ul>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
