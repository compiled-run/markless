import { state } from '@markless/core';

export default function Index() @{
	let hand = state(['7♠', '2♥', 'K♦']);
	let seats = state([
		{ id: 'a', sold: false, picked: false },
		{ id: 'b', sold: true, picked: false },
		{ id: 'c', sold: false, picked: false },
	]);
	<main>
		<button data-push onClick={() => hand.push('9♣')}>push</button>
		<button data-pop onClick={() => hand.pop()}>pop</button>
		<button data-reverse onClick={() => hand.reverse()}>reverse</button>
		<ul data-hand>
			@for (const card of hand; key card) {
				<li data-suit={card.at(-1)}>{card}</li>;
			}
		</ul>
		<button data-pick onClick={() => (seats[2].picked = true)}>pick</button>
		<ul data-seats>
			@for (const seat of seats; key seat.id) {
				<li
					data-sold={seat.sold}
					class={seat.picked ? 'picked' : 'free'}
					onClick={() => (seat.picked = !seat.picked)}
				>
					<img src={'/seat-' + seat.id + '.png'} alt="" />
					{seat.id}
				</li>;
			}
		</ul>
	</main>;
}
