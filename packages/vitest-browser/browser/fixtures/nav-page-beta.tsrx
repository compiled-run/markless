import { computed } from '@markless/core';
import { reachNavSettleGate } from './nav-settle-gate.ts';

// T110 navigation-transition fixture: the fast DESTINATION page. Its async
// read suspends on the test-controlled settle gate rather than a wall-clock
// timer, so the test decides exactly when this page settles and "inside the
// navigation deadline" holds on any machine at any load (see nav-settle-gate.ts).
// A route swap toward it must never show this page's @pending arm (spec D8: no
// flash on fast navs).
export default function BetaPage() @{
	const briefing = computed(async () => {
		await reachNavSettleGate();
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
