import { computed, state } from '@markless/core';
import { fetchItems } from './fetch-items.ts';

export default function Page() @{
	<Board />
}

function Board() @{
	let round = state(0);
	let lists = state([{ id: 0, filter: '' }, { id: 1, filter: 'an' }]);

	<div>
		<button data-refresh onClick={() => round++}>Refresh</button>
		@for (const list of lists; key list.id) {
			<section data-list>
				<Items initialFilter={list.filter} round={round} />
			</section>
		}
		<button data-add onClick={() => (lists = [...lists, { id: lists.length, filter: 'ap' }])}>Add</button>
	</div>
}

function Items({ initialFilter, round }: { initialFilter: string; round: number }) @{
	let filter = state(initialFilter);
	const items = computed(async () => fetchItems(filter, round));

	<div>
		<input value={filter} onInput={(e) => (filter = e.target.value)} />
		@try {
			<ul>
				@for (const item of items; key item) {
					<li>{item}</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<p data-error>{error.message}<button onClick={reset}>Retry</button></p>
		}
	</div>
}
