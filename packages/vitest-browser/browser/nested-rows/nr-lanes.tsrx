import { state } from '@markless/core';

// A vote writes the card and its lane: the lane's own count moves, so the whole
// lane row is built again, and the cards inside it are built after it.
export default function Lanes() @{
	let lanes = state([
		{ id: 'l1', votes: 0, cards: [{ id: 'k1', votes: 0 }, { id: 'k2', votes: 0 }] },
		{ id: 'l2', votes: 0, cards: [{ id: 'k3', votes: 0 }] },
	]);
	let voted = state('nobody');

	<section>
		@for (const lane of lanes; key lane.id) {
			<div class="lane" data-lane={lane.id}>
				<b>{lane.votes}</b>
				<p>
					@for (const card of lane.cards; key card.id) {
						<span data-card={card.id}>
							<button class="vote" onClick={() => { card.votes++; lane.votes++; voted = card.id; }}>{card.votes}</button>
						</span>
					}
				</p>
			</div>
		}
		<output data-voted>{voted}</output>
	</section>
}
