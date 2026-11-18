import { computed, state } from '@markless/core';
import RequestDialog from './request-dialog.tsrx';
import { addTicket, loadUnits } from './units.ts';

export default function ResetPage() @{
	const units = computed(async () => loadUnits());
	let open = state(false);
	let submitting = state(false);

	<main>
		<button data-open onClick={() => (open = true)}>Request</button>
		@try {
			<div>
				@if (open) {
					<RequestDialog
						units={units}
						submitting={submitting}
						onSave={async (unitId) => {
							submitting = true;
							try {
								await addTicket(unitId);
								open = false;
							} finally {
								submitting = false;
							}
						}}
					/>
				}
			</div>
		} @pending {
			<div hidden></div>
		} @catch (error, reset) {
			<div>
				<p>{error.message}</p>
				<button onClick={reset}>Dismiss</button>
			</div>
		}
	</main>
}
