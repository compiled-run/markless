import { computed } from '@markless/core';

export default function SoakBetaPage() @{
	const briefing = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1));
		return { text: 'soak beta ready' };
	});

	<main data-nav-page="soak-beta">
		@try {
			<p data-nav-settled="soak-beta">{briefing.text}</p>
		} @pending {
			<p data-nav-pending="soak-beta">soak beta loading</p>
		} @catch {
			<p data-nav-fault="soak-beta">soak beta failed</p>
		}
	</main>
}
