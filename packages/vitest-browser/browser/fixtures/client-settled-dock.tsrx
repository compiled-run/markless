import { computed, state } from '@markless/core';

export function Dock() @{
	let moored = state(0);
	let berth = state('north');
	const dock = computed(async ({ signal }) => {
		const side = berth;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { name: 'aborted' };
		return { name: 'Dock ' + side };
	});

	<article>
		<button type="button" data-berth onClick={() => berth = 'south'}>Berth</button>
		@try {
			<div>
				<button type="button" data-moor onClick={() => moored++}>{dock.name}</button>
				<strong data-moored>{moored}</strong>
			</div>
		} @pending {
			<p data-docking>Docking</p>
		} @catch {
			<p>Adrift</p>
		}
	</article>
}
