import { computed, state } from '@markless/core';

async function saveReport(days: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	throw new Error(`could not save ${days}`);
}

export default function HandlerRejectNoCatch() @{
	let note = state('idle');
	const report = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { days: 7 };
	});

	<main>
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
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
