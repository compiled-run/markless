import { computed, state } from '@markless/core';
import { loadReport } from './service.ts';

export function Rows() @{
	let regions = state(['north', 'south']);

	<div>
		<ul>
			@for (const region of regions; key region) {
				<Region name={region} />
			}
		</ul>
		<button type="button" data-add onClick={() => (regions = [...regions, 'east'])}>Add</button>
	</div>
}

export function Region({ name }: { name: string }) @{
	let tries = state(1);
	const report = computed(async () => await loadReport(name));

	<li data-region={name}>
		@try {
			<span data-ok>{report}</span>
		} @pending {
			<span data-pending>Checking {name}</span>
		} @catch (problem) {
			<>
				<span data-error>{problem.message} (try {tries} for {name})</span>
				<button type="button" data-next onClick={() => tries++}>Next</button>
			</>
		}
	</li>
}
