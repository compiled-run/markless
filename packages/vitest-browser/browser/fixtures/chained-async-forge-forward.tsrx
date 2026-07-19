import { computed, state } from '@markless/core';

export function App() @{
	let ore = state('copper');
	const assaySheet = computed(async ({ signal }) => {
		const sample = ore;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { grade: 'aborted' };
		return { grade: 'refined-' + sample };
	});
	const makerSeal = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__forwardForgeRuns ||= { makerSeal: 0 });
		runs.makerSeal++;
		const grade = assaySheet.grade;
		await new Promise((resolve) => setTimeout(resolve, 45));
		if (signal.aborted) return { engraving: 'aborted' };
		return { engraving: 'Seal ' + grade };
	});

	<main>
		<button type="button" data-change-ore onClick={() => ore = 'silver'}>Change ore</button>
		<section data-assay-boundary>
			@try {
				<small data-assay-arm>{assaySheet.grade}</small>
			} @pending {
				<small data-assay-arm>Testing ore</small>
			} @catch {
				<small data-assay-arm>Assay failed</small>
			}
		</section>
		<section data-seal-boundary>
			@try {
				<strong data-seal-arm>{makerSeal.engraving}</strong>
			} @pending {
				<strong data-seal-arm>Tempering</strong>
			} @catch {
				<strong data-seal-arm>Seal cracked</strong>
			}
		</section>
	</main>
}
