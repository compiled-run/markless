import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

const ids = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'];

export function FocusKeep() @{
	let query = state('');
	const results = computed(async () => {
		const asked = query;
		return answer(`results:${asked}`, ids.map((id) => ({ id, label: `${asked}${id}` })));
	});

	<section>
		@try {
			<div data-panel>
				<input data-query value={query} onInput={(event) => (query = event.currentTarget.value)} />
				<ul data-list style="height: 60px; overflow: auto; margin: 0; padding: 0">
					@for (const row of results; key row.id) {
						<li data-row={row.id} style="height: 30px; list-style: none">
							<button type="button">{row.label}</button>
						</li>
					}
				</ul>
			</div>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</section>
}
