import { computed, state } from '@markless/core';
import { Panel } from './nt-panel.tsrx';

export function App() @{
	let version = state(0);
	const ship = computed(async () => {
		const at = version;
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { name: 'Ship ' + at };
	});

	<main>
		<button type="button" data-refresh onClick={() => version = version + 1}>Refresh</button>
		@try {
			<div data-outer>
				<h2>{ship.name}</h2>
				<Panel owner={ship.name} />
			</div>
		} @pending {
			<p data-outer-wait>Loading ship</p>
		} @catch {
			<p data-outer-failed>Ship failed</p>
		}
	</main>
}
