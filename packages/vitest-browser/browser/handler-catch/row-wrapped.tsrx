import { computed, state } from '@markless/core';
import { Saver } from './saver.tsrx';

function Panel({ days }) @{
	<div>
		<Saver days={days} />
	</div>
}

// Each keyed row renders a child with its own state: a failed save in one row and a reset keep every row's child as it was.
export function RowWrapped() @{
	let shown = state(2);
	const reports = computed(async () => {
		const count = shown;
		await new Promise((resolve) => setTimeout(resolve, 5));
		return [
			{ id: 'week', days: 7 },
			{ id: 'month', days: 30 },
			{ id: 'year', days: 365 },
		].slice(0, count);
	});

	<main>
		<button type="button" data-add onClick={() => (shown = 3)}>Add</button>
		@try {
			<ul>
				@for (const report of reports; key report.id) {
					<li data-row={report.id}>
						<Panel days={report.days} />
					</li>
				}
			</ul>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
