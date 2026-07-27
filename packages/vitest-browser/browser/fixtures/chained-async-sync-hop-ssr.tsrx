import { computed, state } from '@markless/core';

export function App() @{
	let mineral = state('cobalt');
	const kilnSample = computed(async () => {
		const batch = mineral;
		await Promise.resolve();
		return { tone: batch + '-fired' };
	});
	const catalogCard = computed(() => ({ caption: kilnSample.tone }));
	const exhibitLabel = computed(async () => {
		const caption = catalogCard.caption;
		await Promise.resolve();
		return { text: 'Exhibit ' + caption };
	});

	<section>
		<button type="button" data-change-mineral onClick={() => mineral = 'amber'}>Change mineral</button>
		@try {
			<strong data-exhibit>{exhibitLabel.text}</strong>
		} @pending {
			<strong data-pending>Cataloguing</strong>
		} @catch {
			<strong data-failure>Archive unavailable</strong>
		}
	</section>
}
