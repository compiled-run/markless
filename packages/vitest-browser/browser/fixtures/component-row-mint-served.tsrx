import { state } from '@markless/core';

// The row's key travels on the click event: a handler a row is rebuilt from may
// capture graph data, literals and callbacks, never the repeat item itself.
function Card({ card, onPick }) @{
	<article data-card={card.key} onClick={(event) => onPick(event.currentTarget.getAttribute('data-card'))}><em class="tag">{card.title}</em></article>
}

// The same page the client-mint fixture serves, but with the third row already in
// the served collection: the SSR-equivalence proof compares the two.
export function App() @{
	let chosen = state('none');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
		{ key: 'east', title: 'East' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<div class="cards">
			<h2 data-static>Cards</h2>
			@for (const card of cards; key card.key) {
				<Card card={card} onPick={(key) => chosen = key} />
			}
		</div>
	</main>
}
