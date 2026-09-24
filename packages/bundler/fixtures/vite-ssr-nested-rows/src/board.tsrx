import { state } from '@markless/core';

export function Board() @{
	let lanes = state<Array<{ id: string; votes: number; cards: Array<{ id: string; votes: number }> }>>([]);
	let voted = state('nobody');

	<section class="board">
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
		<button id="lane" onClick={() => (lanes = [...lanes, { id: `l${lanes.length + 1}`, votes: 0, cards: [{ id: `k${lanes.length * 2 + 1}`, votes: 0 }, { id: `k${lanes.length * 2 + 2}`, votes: 0 }] }])}>lane</button>
		<output id="voted">{voted}</output>
	</section>
}
