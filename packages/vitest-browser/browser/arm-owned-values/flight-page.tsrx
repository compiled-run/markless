import { computed, state } from '@markless/core';
import { double } from './api.ts';
import Panel from './panel.tsrx';

export default function FlightPage({ start = null }: { start?: number | null }) @{
	let open = state<number | null>(start);
	let count = state(0);
	const twice = computed(() => double(count));

	<div>
		<button type="button" data-open onClick={() => (open = 1)}>Open</button>
		<button type="button" data-next onClick={() => (open = 2)}>Next</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		<button type="button" data-bump onClick={() => count++}>Bump</button>
		<p data-outside>{twice}</p>
		@if (open !== null) {
			<div>
				<Panel tag="flight" id={open} />
				<p data-inside>{twice}</p>
			</div>
		}
	</div>
}
