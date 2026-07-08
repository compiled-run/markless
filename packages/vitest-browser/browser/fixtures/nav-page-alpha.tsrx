import { computed, state } from '@markless/core';

// T110 navigation-transition fixture: a fast page (async read settles well
// inside the navigation deadline). Its counter button proves the page stays
// live and interactive while it is the OUTGOING page of a route swap.
export default function AlphaPage() @{
	let taps = state(0);
	const greeting = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 15));
		return { text: 'alpha ready' };
	});

	<main data-nav-page="alpha">
		<h1>Alpha</h1>
		<button data-alpha-tap onClick={() => taps++}>Taps {taps}</button>
		@try {
			<p data-nav-settled="alpha">{greeting.text}</p>
		} @pending {
			<p data-nav-pending="alpha">alpha loading</p>
		} @catch {
			<p data-nav-fault="alpha">alpha failed</p>
		}
	</main>
}
