import { computed, state } from '@markless/core';
import { saveReport } from './ledger.ts';

function SaveButton({ onSave }) @{
	<button type="button" data-child-save onClick={onSave}>Save from child</button>
}

// Plain handlers: a promise one returns rejects into the @catch; one it only starts does not.
export function ReturnedPromise() @{
	let note = state('idle');
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 14 };
	});

	<main>
		@try {
			<section>
				<p data-days>{report.days}</p>
				<button
					type="button"
					data-then
					onClick={() => saveReport(report.days).then(() => {
						note = 'saved';
					})}
				>
					Then
				</button>
				<button
					type="button"
					data-return
					onClick={() => {
						note = 'returning';
						return saveReport(report.days);
					}}
				>
					Return
				</button>
				<button
					type="button"
					data-floating
					onClick={() => {
						note = 'floating';
						saveReport(report.days);
					}}
				>
					Floating
				</button>
				<SaveButton
					onSave={() => {
						note = 'child';
						return saveReport(report.days);
					}}
				/>
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
