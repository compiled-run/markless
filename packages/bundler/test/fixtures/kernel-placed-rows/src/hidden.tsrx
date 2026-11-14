import { computed, state } from '@markless/core';
import { loadEdits } from './api.ts';

// Evaluator-drawn rows over the owner's state inside an @if the owner toggles.
export default function Root() @{
	<App />
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
				<Shown initialFilter={view.filter} reload={reload} />
			</div>
		}
	</section>
}

function Shown({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let shown = state(true);
	let mark = state('-');
	const data = computed(async () => loadEdits(filter, reload, false, 0));
	<div class="list shown">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<button data-shown onClick={() => (shown = !shown)}>Show</button>
		@try {
			@if (shown) {
				<ul>
					@for (const todo of data; key todo.id) {
						<li data-row={todo.id}>
							<b data-name>{todo.name}</b>
							<span data-mark-text>{mark + ''}</span>
						</li>
					}
				</ul>
			}
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}
