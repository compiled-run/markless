import { computed, state } from '@markless/core';
import { fetchItems } from './fetch-items.ts';

export default function Screen() @{
	<main>
		<Frame />
	</main>
}

function Frame() @{
	<article>
		<Shelves />
	</article>
}

function Shelves() @{
	let version = state(0);
	let shelves = state([{ key: 'a', query: '' }, { key: 'b', query: 'an' }]);

	<div>
		<button data-refresh onClick={() => version++}>Refresh</button>
		<ol>
			@for (const shelf of shelves; key shelf.key) {
				<li data-list>
					<Shelf query={shelf.query} version={version} />
				</li>
			}
		</ol>
		<button data-add onClick={() => (shelves = [...shelves, { key: `k${shelves.length}`, query: 'ap' }])}>Add</button>
	</div>
}

function Shelf({ query, version }: { query: string; version: number }) @{
	let filter = state(query);
	const items = computed(async () => fetchItems(filter, version));

	<section>
		<input value={filter} onInput={(e) => (filter = e.target.value)} />
		@try {
			<ul>
				@for (const item of items; key item) {
					<li>{item}</li>
				}
			</ul>
		} @pending {
			<em data-loading>Loading</em>
		} @catch (error, reset) {
			<p data-error>{error.message}<button onClick={reset}>Retry</button></p>
		}
	</section>
}
