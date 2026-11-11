import { computed, state } from '@markless/core';
import { loadReport } from './service.ts';

export function SlowRows() @{
	let regions = state(['north', 'slow']);

	<ul>
		@for (const region of regions; key region) {
			<SlowRegion label={region} />
		}
	</ul>
}

export function SlowRegion({ label }: { label: string }) @{
	let tries = state(1);
	const report = computed(async () => await loadReport(label));

	<li data-region={label}>
		@try {
			<span data-ok>{report}</span>
		} @pending {
			<span data-pending>Checking {label}</span>
		} @catch (problem) {
			<>
				<span data-error>{problem.message} (try {tries} for {label})</span>
				<button type="button" data-next onClick={() => tries++}>Next</button>
			</>
		}
	</li>
}
