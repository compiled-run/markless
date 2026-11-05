import { computed, state } from '@markless/core';
import { fetchRows } from './fetch-rows.ts';

export default function RefreshRows() @{
	let version = state(0);
	let picked = state('none');
	const rows = computed(async () => {
		const v = version;
		return fetchRows('rows');
	});

	<main>
		<button class="refetch" onClick={() => version++}>Refetch</button>
		<output>{picked}</output>
		@try {
			<ul>
				@for (const row of rows; key row.id) {
					<li>
						<button onClick={() => (picked = row.text)}>{row.text}</button>
					</li>
				}
			</ul>
		} @pending {
			<p>loading</p>
		}
	</main>
}
