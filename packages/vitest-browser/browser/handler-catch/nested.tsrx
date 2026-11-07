import { computed, state } from '@markless/core';
import { saveReport } from './ledger.ts';
import { Saver } from './saver.tsrx';

function Recorder({ days }) @{
	let note = state('idle');

	<div>
		<button
			type="button"
			data-local-save
			onClick={async () => {
				note = 'recording';
				await saveReport(days);
			}}
		>
			Record
		</button>
		<p data-local-note>{note}</p>
	</div>
}

// A @try with a @catch inside another: a rejection from inside the inner one shows in the inner @catch, never the outer.
export function Nested() @{
	let outerNote = state('idle');
	let innerNote = state('idle');
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 9 };
	});

	<main>
		@try {
			<div>
				<p data-days>{report.days}</p>
				<button
					type="button"
					data-outer-save
					onClick={async () => {
						outerNote = 'outer';
						await saveReport(report.days);
					}}
				>
					Save all
				</button>
				<p data-outer-note>{outerNote}</p>
				@try {
					<section>
						<button
							type="button"
							data-inline-save
							onClick={async () => {
								innerNote = 'inline';
								await saveReport(report.days);
							}}
						>
							Save here
						</button>
						<p data-inner-note>{innerNote}</p>
						<Recorder days={report.days} />
						<Saver days={report.days} />
					</section>
				} @catch (error, reset) {
					<>
						<p data-inner-failed>{error.message}</p>
						<button type="button" data-inner-retry onClick={() => reset()}>Retry</button>
					</>
				}
			</div>
		} @catch (error, reset) {
			<>
				<p data-outer-failed>{error.message}</p>
				<button type="button" data-outer-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</main>
}
