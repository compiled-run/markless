import { computed } from '@markless/core';

// T110 navigation-transition fixture: a genuinely SLOW destination. Its async
// read misses the navigation deadline (250ms) but settles shortly after
// (320ms), so honest pending UI must appear at the swap AND stay visible for
// the pending minimum duration (200ms) instead of blinking away at settle.
export default function SlowPage() @{
	const dossier = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 320));
		return { text: 'slow ready' };
	});

	<main data-nav-page="slow">
		<h1>Slow</h1>
		@try {
			<p data-nav-settled="slow">{dossier.text}</p>
		} @pending {
			<p data-nav-pending="slow">slow loading</p>
		} @catch {
			<p data-nav-fault="slow">slow failed</p>
		}
	</main>
}
