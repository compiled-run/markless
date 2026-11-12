import { computed, state } from '@markless/core';
import { addBook, listBooks, readBook } from './api.ts';
import Catalog from './catalog.tsrx';

export function App() @{
	let reload = state(0);
	let polls = state(0);
	let editing = state<number | null>(null);
	let browsing = state(false);
	let shelves = state([
		{ id: 0, filter: '' },
		{ id: 1, filter: 'u' },
	]);

	<main>
		<button data-reload onClick={() => reload++}>Reload</button>
		<button
			data-poll
			onClick={() => {
				const timer = setInterval(() => {
					reload++;
					polls++;
					if (polls >= 3) clearInterval(timer);
				}, 20);
			}}
		>
			Poll
		</button>
		<output data-polls>{polls}</output>
		<button data-add-shelf onClick={() => (shelves = [...shelves, { id: shelves.length, filter: 'e' }])}>
			Add shelf
		</button>
		@for (const shelf of shelves; key shelf.id) {
			<section data-shelf={shelf.id}>
				<Shelf filter={shelf.filter} reload={reload} onEdit={(id) => (editing = id)} />
			</section>
		}
		@if (editing !== null) {
			<Editor id={editing} onClose={() => (editing = null)} />
		}
		<button data-browse onClick={() => (browsing = !browsing)}>Browse</button>
		@if (browsing) {
			<Catalog filter="d" />
		}
		<Composer onSaved={() => reload++} />
	</main>
}

function Shelf({
	filter,
	reload,
	onEdit,
}: {
	readonly filter: string;
	readonly reload: number;
	readonly onEdit: (id: number) => void;
}) @{
	let open = state(false);
	const books = computed(async ({ signal }) => {
		void reload;
		return listBooks(filter, signal);
	});

	<div>
		<button data-toggle onClick={() => (open = !open)}>{open ? 'Hide' : 'Show'}</button>
		@if (open) {
			<p data-detail>Filter: {filter}</p>
		}
		@try {
			<ul>
				@for (const book of books; key book.id) {
					<li>
						<span data-title>{book.title}</span>
						<button data-edit onClick={() => onEdit(book.id)}>Edit</button>
					</li>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<button data-retry onClick={reset}>Retry</button>
		}
	</div>
}

function Editor({ id, onClose }: { readonly id: number; readonly onClose: () => void }) @{
	const book = computed(async ({ signal }) => readBook(id, signal));

	<div data-editor>
		@try {
			<p data-editing>{book.title}</p>
		} @pending {
			<p>Loading</p>
		} @catch {
			<p>Failed</p>
		}
		<button data-close onClick={onClose}>Close</button>
	</div>
}

function Composer({ onSaved }: { readonly onSaved: () => void }) @{
	let title = state('');
	let saved = state(0);

	<form
		onSubmit={async (event) => {
			event.preventDefault();
			await addBook(title);
			saved++;
			title = '';
			onSaved();
		}}
	>
		<input data-new-title value={title} onInput={(event) => (title = event.currentTarget.value)} />
		<button data-save type="submit">Save</button>
		<output data-saved>{saved}</output>
	</form>
}
