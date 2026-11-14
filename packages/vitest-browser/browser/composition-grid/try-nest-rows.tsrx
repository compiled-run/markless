import { computed, state } from '@markless/core';
import type { Row } from './grid-server.ts';

export function TryNestRows({ items }: { items: ReadonlyArray<Row> }) @{
	let shown = state('rows');
	const mode = computed(async () => await Promise.resolve(shown));

	@try {
		<div>
			@if (mode === 'rows') {
				<ul>
					@for (const row of items; key row.id) {
						<li data-g="row">{row.label}</li>
					}
				</ul>
			} @else {
				<p data-g="hidden">Hidden</p>
			}
			<button type="button" data-nest-toggle onClick={() => (shown = shown === 'rows' ? 'hidden' : 'rows')}>Rows</button>
		</div>
	} @pending {
		<p data-g="pending">Loading rows</p>
	}
}
