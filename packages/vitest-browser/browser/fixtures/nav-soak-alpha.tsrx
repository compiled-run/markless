import { computed } from '@markless/core';

export default function SoakAlphaPage() @{
	const greeting = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1));
		return { text: 'soak alpha ready' };
	});

	<main data-nav-page="soak-alpha">
		@try {
			<p data-nav-settled="soak-alpha">{greeting.text}</p>
		} @pending {
			<p data-nav-pending="soak-alpha">soak alpha loading</p>
		} @catch {
			<p data-nav-fault="soak-alpha">soak alpha failed</p>
		}
	</main>
}
