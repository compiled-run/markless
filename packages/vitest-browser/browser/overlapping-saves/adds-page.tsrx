import { computed, state } from '@markless/core';
import { addTodo, loadBoard } from './server.ts';

export default function AddsPage() @{
	const board = computed(async () => await loadBoard());
	let drafts = state<string[]>([]);
	let next = state(0);
	let error = state('');
	const titles = ['Bread', 'Jam', 'Tea'];

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
						} catch {
							error = title;
						} finally {
							drafts = drafts.filter((draft) => draft !== title);
						}
					}}
				>
					Add
				</button>
				<ul>
					@for (const todo of board.todos; key todo.id) {
						<li data-todo>{todo.title}</li>
					}
					@for (const draft of drafts; key draft) {
						<li data-saving>{draft}</li>
					}
				</ul>
				<p data-error>{error}</p>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
