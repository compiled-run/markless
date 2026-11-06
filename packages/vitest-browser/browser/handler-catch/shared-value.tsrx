import { computed, state } from '@markless/core';
import { fetches, saveReport } from './ledger.ts';

// The same async value read in two @try blocks: a handler in the first one fails only the first one.
export function SharedValue() @{
	let note = state('idle');
	const report = computed(async () => {
		fetches.report += 1;
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 7 };
	});

	<main>
		<div data-first>
			@try {
				<section>
					<p data-days>{report.days}</p>
					<button
						type="button"
						data-save
						onClick={async () => {
							note = 'saving';
							await saveReport(report.days);
							note = 'saved';
						}}
					>
						Save
					</button>
					<p data-note>{note}</p>
				</section>
			} @catch (error, reset) {
				<>
					<p data-failed>{error.message}</p>
					<button type="button" data-retry onClick={() => reset()}>Retry</button>
				</>
			}
		</div>
		<div data-second>
			@try {
				<p data-other-days>{report.days}</p>
			} @catch (error) {
				<p data-other-failed>{error.message}</p>
			}
		</div>
	</main>
}
