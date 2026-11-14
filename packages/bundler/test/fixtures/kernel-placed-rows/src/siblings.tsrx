import { computed, state } from '@markless/core';
import { loadTodos } from './api.ts';

// The evaluated shape with both lists as direct siblings in the row, no component around them.
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
		<button data-add onClick={() => (views = [...views, { id: views.length, filter: 'e' }])}>Add list</button>
		@for (const view of views; key view.id) {
			<div data-view={view.id}>
				<Joined initialFilter={view.filter} reload={reload} />
				<Carded initialFilter={view.filter} reload={reload} />
			</div>
		}
	</section>
}

function Joined({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let picked = state('');
	let mark = state('-');
	const data = computed(async () => loadTodos(filter, reload));
	<div class="list joined">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<output data-picked>{picked}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<li data-row={todo.id}>
						<button data-pick onClick={() => (picked = todo.name)}>{todo.name}</button>
						<span data-mark-text>{mark + ''}</span>
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

function Carded({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let picked = state('');
	let mark = state('-');
	const data = computed(async () => loadTodos(filter, reload));
	<div class="list carded">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<output data-picked>{picked}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<Card id={todo.id} name={todo.name} mark={mark} onPick={(name) => (picked = name)} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}

function Card({ id, name, mark, onPick }: { id: number; name: string; mark: string; onPick: (name: string) => void }) @{
	<li data-row={id}>
		<button data-pick onClick={() => onPick(name)}>{name}</button>
		<span data-mark-text>{mark}</span>
	</li>
}
