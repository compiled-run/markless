import { computed, state } from '@markless/core';

export function App() @{
	let mineral = state('azurite');
	const kilnSample = computed(async () => {
		const runs = ((globalThis as any).__syncHopRuns ||= { sample: 0, label: 0 });
		runs.sample++;
		const batch = mineral;
		await Promise.resolve();
		return { tone: batch + '-fired' };
	});
	const catalogCard = computed(() => ({ caption: kilnSample.tone }));
	const exhibitLabel = computed(async () => {
		const runs = ((globalThis as any).__syncHopRuns ||= { sample: 0, label: 0 });
		runs.label++;
		await Promise.resolve();
		return { text: 'Exhibit ' + catalogCard.caption };
	});

	<section>
		<button type="button" data-change-mineral onClick={() => mineral = 'ochre'}>Change mineral</button>
		@try {
			<strong data-exhibit>{exhibitLabel.text}</strong>
		} @pending {
			<strong data-pending>Cataloguing</strong>
		} @catch {
			<strong data-failure>Archive unavailable</strong>
		}
	</section>
}
