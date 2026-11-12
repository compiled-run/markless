import { computed, state } from '@markless/core';
import { QuickAdd } from '../components/quick-add.tsrx';
import { loadTodos } from '../src/todos.ts';

// A form in each keyed row, and a component with its own form rendered three times.
export default function Rows() @{
	const todos = computed(async () => await loadTodos());
	const lists = state([{ id: 'home' }, { id: 'work' }]);

	<main data-page="rows">
		@try {
			<section>
				<ul data-rows>
					@for (const list of lists; key list.id) {
						<li data-row={list.id}>
							<form method="post" action={`/api/todos?list=${list.id}`}>
								<input name="title" data-row-title aria-label={`Title for ${list.id}`} />
								<button type="submit" data-row-submit>Add to {list.id}</button>
							</form>
						</li>
					}
				</ul>
				<p data-total>{todos.length}</p>
			</section>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p data-rows-error>{error.message}</p>
		}
		<QuickAdd name="one" />
		<QuickAdd name="two" />
		<QuickAdd name="three" />
	</main>
}
