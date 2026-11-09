import { computed, state } from '@markless/core';
import { saveReport } from './ledger.ts';

function RowSaver({ id, days }) @{
	let note = state('idle');

	<li data-row={id}>
		<button
			type="button"
			data-save
			onClick={async () => {
				note = 'saving';
				await saveReport(days);
			}}
		>
			Save
		</button>
		<p data-note>{note}</p>
	</li>
}

// Each keyed row is a component with its own state.
export function RowComponents() @{
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
					<RowSaver id={report.id} days={report.days} />
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
