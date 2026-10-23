import { state } from '@markless/core';

export function Board() @{
	let cards = state([
		{ id: 1, title: 'first' },
		{ id: 2, title: 'second' },
	]);
	let picked = state(0);

	<main>
		<button type="button" data-add onClick={() => cards = [...cards, { id: cards.length + 1, title: 'more' }]}>Add</button>
		<ul>
			@for (card of cards; key card.id) {
				<li class={picked === card.id ? 'picked' : ''}><a data-pick onClick={() => picked = card.id}>{card.title}</a></li>
			}
		</ul>
	</main>
}
