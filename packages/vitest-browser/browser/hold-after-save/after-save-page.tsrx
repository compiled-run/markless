import { computed, state } from '@markless/core';
import { addStoppable, addTodo, loadShelf, somethingElse, stopSave } from './server.ts';

export default function AfterSavePage() @{
	let reload = state(0);
	const shelf = computed(async () => {
		reload;
		return await loadShelf();
	});
	let status = state('Ready');
	let draft = state('');
	let ticks = state(-1);
	let seen = state('');
	const shout = computed(() => status.toUpperCase());

	<main>
		@try {
			<section>
				<button
					data-then-wait
					onClick={async () => {
						status = 'Saving';
						await addTodo('Bread');
						status = 'Saved';
						await somethingElse();
						status = 'Ready';
					}}
				>
					Save, then keep working
				</button>
				<button
					data-bump
					onClick={async () => {
						status = 'Saving';
						await addTodo('Jam');
						status = 'Saved';
						reload++;
					}}
				>
					Save, then load again
				</button>
				<button
					data-timer
					onClick={async () => {
						ticks = 0;
						const timer = setInterval(() => ticks++, 16);
						try {
							await addTodo('Tea');
						} finally {
							clearInterval(timer);
						}
					}}
				>
					Save with a timer
				</button>
				<button
					data-two
					onClick={async () => {
						status = 'Saving';
						await addTodo('Oats');
						await addTodo('Rice');
						status = 'Saved';
					}}
				>
					Save twice
				</button>
				<button
					data-abortable
					onClick={async () => {
						status = 'Saving';
						try {
							await addStoppable('Figs');
							status = 'Saved';
						} catch {
							status = 'Aborted';
						}
					}}
				>
					Save, can be stopped
				</button>
				<button data-abort onClick={() => stopSave()}>Stop</button>
				<button
					data-save-then-wait
					onClick={async () => {
						await addTodo('Kale');
						await somethingElse();
					}}
				>
					Save, then wait
				</button>
				<button
					data-quick
					onClick={async () => {
						status = 'Saving';
						await addTodo('Bread');
						status = 'Saved';
					}}
				>
					Save
				</button>
				<button
					data-cancel
					onClick={async () => {
						await Promise.resolve();
						status = 'Cancelled';
					}}
				>
					Cancel
				</button>
				<button data-read onClick={() => (seen = `${status}/${shout}`)}>Read</button>
				<input data-draft value={draft} onInput={(event) => (draft = event.target.value)} />
				<p data-status>{status}</p>
				<p data-both>{`${status} ${draft}`}</p>
				<p data-ticks>{ticks}</p>
				<p data-seen>{seen}</p>
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
