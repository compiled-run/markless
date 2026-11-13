import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

export default function Root() @{
	let rate = state(3);
	<div class="root"><input value={rate} /><App /></div>
}

function App() @{
	let reload = state(0);
	let views = state([{ id: 0, filter: '' }, { id: 1, filter: 'a' }]);
	<section>
		<button data-reload onClick={() => reload++}>Reload</button>
		@for (const view of views; key view.id) {
			<div class="view"><Todos initialFilter={view.filter} reload={reload} /></div>
		}
	</section>
}

function Todos({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let picked = state('');
	let filter = state(initialFilter);
	const data = computed(async () => loadTodos(filter, reload));
	<div class="list">
		<output data-picked>{picked}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<li><button data-pick onClick={() => (picked = todo.name)}>{todo.name}</button><span>{picked}</span></li>
				}
			</ul>
		} @pending {
			<span>Loading</span>
		} @catch {
			<span>Failed</span>
		}
	</div>
}
