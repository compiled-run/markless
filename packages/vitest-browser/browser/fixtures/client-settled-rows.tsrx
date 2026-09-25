import { computed, state } from '@markless/core';

export function App() @{
	let hails = state(0);
	let fleet = state(2);
	const marina = computed(async ({ signal }) => {
		const size = fleet;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { name: 'aborted', boats: [] };
		return {
			name: 'Marina ' + size,
			boats: Array.from({ length: size }, (_, at) => ({ id: 'b' + at, label: 'Boat ' + at })),
		};
	});

	<main>
		<button type="button" data-grow onClick={() => fleet = 3}>Grow</button>
		@try {
			<article>
				<ol>
					@for (const boat of marina.boats; key boat.id) {
						<li><span>{boat.label}</span></li>
					}
				</ol>
				<button type="button" data-hail onClick={() => hails++}>{marina.name}</button>
				<b data-hails>{hails}</b>
			</article>
		} @pending {
			<p>Counting boats</p>
		} @catch {
			<p>Storm</p>
		}
	</main>
}
