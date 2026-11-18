import { computed } from '@markless/core';
import { addItem, loadItems } from './server.ts';

export function TenValues() @{
	const v0 = computed(async () => await loadItems('/mut/items?v=0'));
	const v1 = computed(async () => await loadItems('/mut/items?v=1'));
	const v2 = computed(async () => await loadItems('/mut/items?v=2'));
	const v3 = computed(async () => await loadItems('/mut/items?v=3'));
	const v4 = computed(async () => await loadItems('/mut/items?v=4'));
	const v5 = computed(async () => await loadItems('/mut/items?v=5'));
	const v6 = computed(async () => await loadItems('/mut/items?v=6'));
	const v7 = computed(async () => await loadItems('/mut/items?v=7'));
	const v8 = computed(async () => await loadItems('/mut/items?v=8'));
	const v9 = computed(async () => await loadItems('/mut/items?v=9'));

	<main>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add</button>
		@try {
			<p data-value="0">{v0.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="1">{v1.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="2">{v2.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="3">{v3.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="4">{v4.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="5">{v5.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="6">{v6.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="7">{v7.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="8">{v8.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="9">{v9.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
