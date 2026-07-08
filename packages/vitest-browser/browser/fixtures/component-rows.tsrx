import { state } from '@markless/core';

function Tag({ name }) @{
	<em class="tag">{name}</em>
}

export function App() @{
	let chosen = state('none');
	let cards = state([
		{ key: 'north', title: 'North' },
		{ key: 'south', title: 'South' },
	]);

	<main>
		<output data-chosen>{chosen}</output>
		<button data-flip onClick={() => cards = [
			{ key: 'south', title: 'South' },
			{ key: 'north', title: 'North' },
		]}>Flip</button>
		<div class="cards">
			@for (const card of cards; key card.key) {
				<article data-card={card.key} onClick={() => chosen = card.key}><Tag name={card.title} /></article>
			}
		</div>
	</main>
}
