import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Root() @{
	let rate = state(3);
	<div><input data-rate value={rate} /><App /></div>
}

function App() @{
	let reload = state(0);
	let views = state([
		{ id: 0, filter: '' },
		{ id: 1, filter: 'u' },
	]);
	<section>
		<button data-reload onClick={() => reload++}>Reload</button>
		@for (const view of views; key view.id) {
			<div data-view={view.id}><Todos initialFilter={view.filter} reload={reload} /></div>
		}
	</section>
}

function Todos({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let picked = state('');
	let mark = state('-');
	const data = computed(async () => loadTodos(filter, reload));
	<div class="list">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<output data-picked>{picked}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<li data-row={todo.id}>
						<button data-pick onClick={() => (picked = todo.name)}>{todo.name}</button>
						<span data-mark-text>{mark}</span>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}
