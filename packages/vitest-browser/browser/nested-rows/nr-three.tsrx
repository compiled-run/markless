import { state } from '@markless/core';

// Three levels of rows: a card handler writes its card, its lane and its region.
export default function Three() @{
	let regions = state([
		{ id: 'north', total: 0, lanes: [
			{ id: 'n1', total: 0, cards: [{ id: 'a', hits: 0 }, { id: 'b', hits: 0 }] },
			{ id: 'n2', total: 0, cards: [{ id: 'c', hits: 0 }] },
		] },
		{ id: 'south', total: 0, lanes: [
			{ id: 's1', total: 0, cards: [{ id: 'd', hits: 0 }] },
		] },
	]);
	let last = state('none');

	<section>
		@for (const region of regions; key region.id) {
			<article data-region={region.id}>
				<h2>{region.total}</h2>
				@for (const lane of region.lanes; key lane.id) {
					<div data-lane={lane.id}>
						<h3>{lane.total}</h3>
						@for (const card of lane.cards; key card.id) {
							<button data-card={card.id} onClick={() => { card.hits++; lane.total++; region.total++; last = card.id; }}>{card.hits}</button>
						}
					</div>
				}
			</article>
		}
		<button type="button" data-add onClick={() => (regions = [...regions, { id: 'east', total: 0, lanes: [{ id: 'e1', total: 0, cards: [{ id: 'e', hits: 0 }] }] }])}>add</button>
		<output data-last>{last}</output>
	</section>
}
