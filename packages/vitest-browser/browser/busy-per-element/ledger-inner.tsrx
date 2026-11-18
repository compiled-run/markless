import { computed, state } from '@markless/core';

export function Ledger() @{
	let month = state(1);
	const owner = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { name: 'Kit' };
	});
	const entries = computed(async () => {
		const at = month;
		await new Promise((resolve) => setTimeout(resolve, at === 1 ? 10 : 700));
		return at === 1 ? [{ id: 'm' }, { id: 'n' }] : [{ id: 'o' }];
	});
	const count = computed(() => entries.length + ' entries');

	<section>
		<button type="button" data-month onClick={() => (month = 2)}>Next month</button>
		@try {
			<div data-ledger>
				<h2 data-owner>{owner.name}</h2>
				@try {
					<>
						<h3 data-count>{count}</h3>
						<ol data-entries>
							@for (const entry of entries; key entry.id) {
								<li>{entry.id}</li>
							}
						</ol>
						<p data-note>Closed monthly</p>
					</>
				} @catch {
					<p data-entries-failed>Entries failed</p>
				}
			</div>
		} @pending {
			<p data-pending>Opening ledger</p>
		}
	</section>
}
