import { computed } from '@markless/core';
import { fetchShelf } from './fetch-shelf.ts';

export function Shelf({ tag, version }: { tag: string; version: number }) @{
	const rows = computed(async () => {
		const which = tag;
		const v = version;
		return fetchShelf(`${which} v${v}`);
	});

	<div class="shelf">
		@try {
			<ul>
				@for (const row of rows; key row.id) {
					<li data-shelf-row>{row.text}</li>
				}
			</ul>
		} @pending {
			<p data-shelf-loading>loading</p>
		}
	</div>
}
