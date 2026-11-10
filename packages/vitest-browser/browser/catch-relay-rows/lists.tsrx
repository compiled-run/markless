import { computed, state } from '@markless/core';
import { loadItems } from './server.ts';

function List({ initialFilter, onPick, reload }: { initialFilter: string; onPick: (id: number) => void; reload: number }) @{
	const attempt = 0;
	let filter = state(initialFilter);
	const items = computed(async () => {
		void reload;
		return loadItems(filter);
	});

	<section data-list={initialFilter || 'all'}>
		<input data-filter value={filter} onInput={(event) => (filter = event.currentTarget.value)} />
		@try {
			<>
				<ul>
					@for (const item of items; key item.id) {
						<li data-item>
							{item.name}
							<button type="button" onClick={() => onPick(item.id)}>Pick</button>
						</li>
					}
				</ul>
				<p data-count>{items.length} items for "{filter}", attempt {attempt + 1}</p>
			</>
		} @pending {
			<p data-loading>Loading, attempt {attempt + 1}</p>
		} @catch (error, reset) {
			<p data-failed>
				{error.message}
				<button type="button" data-retry onClick={reset}>Retry</button>
			</p>
		}
	</section>
}

// A callback prop relayed from a row inside a @try, in a list of components: the @catch still shows a failed refresh.
export function RelayLists() @{
	let reload = state(0);
	let picked = state<number | null>(null);
	let views = state([{ id: 0, filter: '' }, { id: 1, filter: 'grape' }]);

	<main>
		<button type="button" data-refetch onClick={() => reload++}>Refetch</button>
		@for (const view of views; key view.id) {
			<div>
				<List initialFilter={view.filter} onPick={(next) => (picked = next)} reload={reload} />
			</div>
		}
		<p data-picked>{String(picked)}</p>
	</main>
}
