import { computed, state } from '@markless/core';
import { fetchRows } from './fetch-rows.ts';

export default function NestedRowHandler() @{
	let picked = state('none');
	const groups = computed(async () => {
		const rows = await fetchRows('g');
		return rows.map((row) => ({ id: row.id, failed: row.id === 2, items: rows }));
	});

	<main>
		<output>{picked}</output>
		@try {
			<div>
				@for (const group of groups; key group.id) {
					<section>
						<button class="row" onClick={() => (picked = `row ${group.id}`)}>Row</button>
						@if (group.failed) {
							<button class="retry" onClick={() => (picked = `retry ${group.id}`)}>Retry</button>
						} @else {
							<ul>
								@for (const item of group.items; key item.id) {
									<li>
										<button class="pick" onClick={() => (picked = `pick ${item.id}`)}>Pick</button>
									</li>
								}
							</ul>
						}
					</section>
				}
			</div>
		} @pending {
			<p>loading</p>
		}
	</main>
}
