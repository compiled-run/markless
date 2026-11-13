import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Caught() @{
	let reload = state(0);
	const todos = computed(async () => loadTodos('', reload));
	<section class="caught">
		<button data-again onClick={() => reload++}>Again</button>
		@try {
			<ul>
				@for (const todo of todos; key todo.id) {
					<li>{todo.name}</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch (error, reset) {
			<p data-failed>Could not load <button data-retry onClick={reset}>Retry</button></p>
		}
	</section>
}
