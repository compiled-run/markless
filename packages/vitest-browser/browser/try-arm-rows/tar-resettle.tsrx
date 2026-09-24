import { computed, state } from '@markless/core';

export default function Depot() @{
	let zone = state('west');
	let chosen = state('none');
	const trucks = computed(async ({ signal }) => {
		const area = zone;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return [];
		return [{ tag: area + '-a', load: 0 }, { tag: area + '-b', load: 0 }];
	});

	<section>
		<button type="button" data-zone onClick={() => (zone = 'east')}>East</button>
		@try {
			<div class="depot">
				@for (const truck of trucks; key truck.tag) {
					<span class="truck">
						<button type="button" data-row={truck.tag} onClick={() => (chosen = truck.tag)}>{truck.tag}</button>
					</span>
				}
			</div>
		} @pending {
			<em class="waiting">Waiting</em>
		} @catch {
			<em class="failed">Failed</em>
		}
		<output data-chosen>{chosen}</output>
	</section>
}
