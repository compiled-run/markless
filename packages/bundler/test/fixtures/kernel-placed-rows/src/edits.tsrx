import { computed, state } from '@markless/core';
import { loadEdits, saveEdit } from './api.ts';
import { Carded } from './evaluated.tsrx';
import Tile from './tile.tsrx';

// Evaluator-drawn rows over the owner's state that the owner reorders and removes while a save is held, and
// rows rendered by components from other files.
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
				<Edited initialFilter={view.filter} reload={reload} />
				<Tiled initialFilter={view.filter} reload={reload} />
				<Carded initialFilter={view.filter} reload={reload} />
			</div>
		}
	</section>
}

function Edited({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let descending = state(false);
	let dropped = state(0);
	let saved = state('');
	let mark = state('-');
	const data = computed(async () => loadEdits(filter, reload, descending, dropped));
	<div class="list edited">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<button data-flip onClick={() => (descending = !descending)}>Flip</button>
		<output data-saved>{saved}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<li data-row={todo.id}>
						<b data-name>{todo.name}</b>
						<button
							data-save
							onClick={async () => {
								await saveEdit(todo.id);
								saved = saved + todo.name;
							}}
						>
							Save
						</button>
						<button data-drop onClick={() => (dropped = todo.id)}>Drop</button>
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

function Tiled({ initialFilter, reload }: { initialFilter: string; reload: number }) @{
	let filter = state(initialFilter);
	let picked = state('');
	let mark = state('-');
	const data = computed(async () => loadEdits(filter, reload, false, 0));
	<div class="list tiled">
		<button data-mark onClick={() => (mark = mark + '+')}>Mark</button>
		<output data-picked>{picked}</output>
		@try {
			<ul>
				@for (const todo of data; key todo.id) {
					<Tile id={todo.id} name={todo.name} mark={mark} onPick={(name) => (picked = name)} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
	</div>
}
