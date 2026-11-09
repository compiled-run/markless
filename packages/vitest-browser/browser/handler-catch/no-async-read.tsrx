import { state } from '@markless/core';
import { saveReport } from './ledger.ts';

// A @try whose block reads no async value still catches its handler's rejection.
export function NoAsyncRead() @{
	let note = state('idle');

	<main>
		@try {
			<section>
				<button
					type="button"
					data-save
					onClick={async () => {
						note = 'saving';
						await saveReport(3);
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
	</main>
}
