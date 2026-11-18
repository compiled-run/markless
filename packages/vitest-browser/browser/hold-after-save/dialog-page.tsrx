import { computed, state } from '@markless/core';
import { addTodo, loadShelf } from './server.ts';

export default function DialogPage() @{
	const shelf = computed(async () => await loadShelf());
	let open = state(false);
	let label = state('Save');
	let view = state('list');

	<main>
		@try {
			<section>
				@if (view === 'done') {
					<p data-done>All saved</p>
				} @else {
					<button data-open onClick={() => (open = true)}>New</button>
				}
				@if (view !== 'done' && open) {
					<div role="dialog" data-dialog>
						<button
							data-save
							onClick={async () => {
								label = 'Saving';
								await addTodo('Tea');
								open = false;
								label = 'Save';
							}}
						>
							{label}
						</button>
					</div>
				}
				<button
					data-finish
					onClick={async () => {
						label = 'Saving';
						await addTodo('Jam');
						view = 'done';
						label = 'Save';
					}}
				>
					{label}
				</button>
				<ul>
					@for (const todo of shelf.todos; key todo.id) {
						<li data-todo>{todo.title}</li>
					}
				</ul>
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
