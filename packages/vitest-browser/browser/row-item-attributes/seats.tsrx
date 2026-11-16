import { state } from '@markless/core';

export default function Seats() @{
	let seats = state([
		{ id: 'a', sold: false, picked: false },
		{ id: 'b', sold: true, picked: false },
	]);
	<section>
		<button data-pick onClick={() => (seats[1].picked = true)}>pick</button>
		<ul data-seats>
			@for (const seat of seats; key seat.id) {
				<li class={seat.picked ? 'picked' : 'free'} onClick={() => (seat.picked = !seat.picked)}>
					<img src={'/seat-' + seat.id + '.png'} alt="" />
					{seat.id}
				</li>
			}
		</ul>
	</section>
}
