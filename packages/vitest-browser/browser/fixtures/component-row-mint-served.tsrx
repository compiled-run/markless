import { state } from '@markless/core';

function Card({ title }) @{
	<em class="tag">{title}</em>
}

// The same page the client-mint fixture serves, but with the third row already
// in the served collection: the SSR-equivalence proof compares the two.
export function App() @{
	let chosen = state('none');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
		{ key: 'east', title: 'East' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<button data-add onClick={() => cards = [...cards, { key: 'east', title: 'East' }]}>Add</button>
		<button data-drop onClick={() => cards = cards.filter((card) => card.key !== 'south')}>Drop</button>
		<button data-restore onClick={() => cards = [
			{ key: 'north', title: 'North' },
			{ key: 'south', title: 'South' },
		]}>Restore</button>
		<div class="cards">
			<h2 data-static>Cards</h2>
			@for (const card of cards; key card.key) {
				<article data-card={card.key} onClick={() => chosen = card.key}><Card title={card.title} /></article>
			}
		</div>
	</main>
}
