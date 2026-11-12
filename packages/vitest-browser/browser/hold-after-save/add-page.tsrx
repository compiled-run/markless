import { computed, state } from '@markless/core';
import { addTodo, loadShelf } from './server.ts';

export default function AddPage() @{
	const shelf = computed(async () => await loadShelf());
	let draft = state('Bread');
	let sending = state<string | null>(null);
	let status = state('Ready');
	let failure = state<string | null>(null);

	<main>
		<p data-outside>{sending ?? 'idle'}</p>
		@try {
			<section>
				<form
					data-form
					onSubmit={async (event) => {
						event.preventDefault();
						const title = draft;
						sending = title;
						status = 'Saving';
						failure = null;
						try {
							await addTodo(title);
							draft = '';
							status = 'Saved';
						} catch (error) {
							failure = (error as Error).message;
							status = 'Failed';
						} finally {
							sending = null;
						}
					}}
				>
					<input data-field value={draft} onInput={(event) => (draft = event.target.value)} />
					<button type="submit" data-add disabled={sending !== null}>Add</button>
				</form>
				<button data-dismiss onClick={() => (status = 'Ready')}>Dismiss</button>
				<p data-status>{status}</p>
				@if (failure !== null) {
					<p data-failure>{failure}</p>
				}
				<ul>
					@for (const todo of shelf.todos; key todo.id) {
						<li data-todo>{todo.title}</li>
					}
					@if (sending !== null) {
						<li data-saving>{sending}</li>
					}
				</ul>
			
			</section>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
