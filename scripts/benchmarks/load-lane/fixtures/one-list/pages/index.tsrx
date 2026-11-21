import { computed, state } from '@markless/core';
import { getTodos } from '../api.ts';

function List({ initialFilter }: { readonly initialFilter: string }) @{
	let filter = state(initialFilter);
	const todos = computed(async () => getTodos(filter));

	<section>
		<button onClick={() => (filter = filter === 'all' ? 'done' : 'all')}>Filter {filter}</button>
		@try {
			<ul data-list>
				@for (const todo of todos; key todo.id) {
					<li>{todo.title}</li>;
				} @empty {
					<li>Nothing here</li>;
				}
			</ul>;
		} @pending {
			<p>Loading…</p>;
		} @catch {
			<p>Could not load</p>;
		}
	</section>
}

function App() @{
	const views = state(['all']);

	<div class="lists">
		@for (const view of views; key view) {
			<List initialFilter={view} />;
		}
	</div>
}

export default function Home() @{
	let count = state(0);

	<main>
		<h1>One list</h1>
		<button onClick={() => count++}>Count {count}</button>
		<App />
	</main>
}
