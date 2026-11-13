import { computed, state } from '@markless/core';
import { listBooks, saveBook } from './shelf.ts';

function Shelf({ initialFilter }: { readonly initialFilter: string }) @{
	let filter = state(initialFilter);
	let version = state(0);
	const books = computed(async () => listBooks(filter, version));

	<section data-shelf={initialFilter}>
		<button class="filter" onClick={() => (filter = filter === 'read' ? 'all' : 'read')}>Filter {filter}</button>
		<button
			class="save"
			onClick={async () => {
				await saveBook('Middlemarch');
				version++;
			}}
		>
			Save
		</button>
		@try {
			<ul class="books">
				@for (const book of books; key book.id) {
					<li>{book.title}</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		} @catch (error, reset) {
			<p class="failed">
				{error.message}
				<button class="retry" onClick={reset}>Retry</button>
			</p>
		}
	</section>
}

function Shelves() @{
	const filters = state(['all', 'remote']);

	<div class="shelves">
		@for (const filter of filters; key filter) {
			<Shelf initialFilter={filter} />
		}
	</div>
}

export function Library() @{
	<div class="library">
		<Shelves />
	</div>
}
