import { computed, state } from '@markless/core';
import { addTodo, loadShelf } from './server.ts';

export default function SharedListPage() @{
	const shelf = computed(async () => await loadShelf());
	let drafts = state<string[]>([]);
	let next = state(0);
	const titles = ['Bread', 'Butter'];

	<main>
		@try {
			<section>
				<button
					data-add
					onClick={async () => {
						const title = titles[next % titles.length]!;
						next = next + 1;
						drafts = [...drafts, title];
						try {
							await addTodo(title);
						} finally {
							drafts = drafts.filter((draft) => draft !== title);
						}
					}}
				>
					Add
				</button>
				<ul>
					@for (const todo of shelf.todos; key todo.id) {
						<li data-todo>{todo.title}</li>
					}
					@for (const draft of drafts; key draft) {
						<li data-saving>{draft}</li>
					}
				</ul>
			
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
