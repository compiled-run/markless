import { computed, state } from '@markless/core';
import { loadItems, type Item } from './data.ts';

// Rows with a few elements and a handler each: a press that refreshes the list and a press that edits one row.
export function PlainList({ rows }: { readonly rows: number }) @{
	const full = state(rows);
	let size = state(rows);
	let picked = state(0);
	const items = computed(async () => loadItems(size));

	<section class="list">
		<button class="shrink" onClick={() => (size = size === full ? 10 : full)}>Rows {size}</button>
		@try {
			<ul data-list>
				@for (const item of items; key item.id) {
					<li class={picked === item.id ? 'picked' : 'row'}>
						<span class="label">{item.label}</span>
						<em>{item.size}</em>
						<button class="pick" onClick={() => (picked = item.id)}>{picked === item.id ? 'Picked' : 'Pick'}</button>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</section>
}

function Row({ item }: { readonly item: Item }) @{
	let count = state(0);

	<li class="row">
		<span class="label">{item.label}</span>
		<em>{item.size}</em>
		<button class="pick" onClick={() => count++}>Picked {count}</button>
	</li>
}

export function ComponentList({ rows }: { readonly rows: number }) @{
	const full = state(rows);
	let size = state(rows);
	const items = computed(async () => loadItems(size));

	<section class="list">
		<button class="shrink" onClick={() => (size = size === full ? 10 : full)}>Rows {size}</button>
		@try {
			<ul data-list>
				@for (const item of items; key item.id) {
					<Row item={item} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</section>
}
