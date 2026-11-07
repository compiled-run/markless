import { computed, state } from '@markless/core';
import { saveReport } from './ledger.ts';

function SaveButton({ onSave }) @{
	<button type="button" data-save onClick={onSave}>Save</button>
}

// A callback prop that rejects reaches the @catch around the child that calls it; an inner
// @try with only @pending is skipped on the way out.
export function CallbackProp() @{
	let note = state('idle');
	const range = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { from: 'May', to: 'June' };
	});
	const totals = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 30 };
	});

	<main>
		@try {
			<section>
				<p data-range>{range.from + '-' + range.to}</p>
				@try {
					<div>
						<p data-days>{totals.days}</p>
						<SaveButton
							onSave={async () => {
								note = 'saving';
								await saveReport(totals.days);
							}}
						/>
					</div>
				} @pending {
					<p data-inner-pending>Loading</p>
				}
				<p data-note>{note}</p>
			</section>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
