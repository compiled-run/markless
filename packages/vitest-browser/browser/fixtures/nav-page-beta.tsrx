import { computed } from '@markless/core';

// T110 navigation-transition fixture: the fast DESTINATION page. Its async
// read settles inside the navigation deadline, so a route swap toward it must
// never show this page's @pending arm (spec D8: no flash on fast navs).
export default function BetaPage() @{
	const briefing = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 80));
		return { text: 'beta ready' };
	});

	<main data-nav-page="beta">
		<h1>Beta</h1>
		@try {
			<p data-nav-settled="beta">{briefing.text}</p>
		} @pending {
			<p data-nav-pending="beta">beta loading</p>
		} @catch {
			<p data-nav-fault="beta">beta failed</p>
		}
	</main>
}
