import { state } from '@markless/core';

export default function Vote() @{
	let options = state([
		{ name: 'Pizza', votes: 0 },
		{ name: 'Sushi', votes: 0 },
	]);
	function lead() {
		let best = '';
		let most = 0;
		for (const o of options) {
			if (o.votes > most) {
				most = o.votes;
				best = o.name;
			}
		}
		return best;
	}
	<section>
		<ul data-options>
			@for (const o of options; key o.name) {
				<li>
					<button onClick={() => o.votes++}>{o.name}</button>
					<b>{o.votes}{o.name === lead() ? ' 👑' : ''}</b>
				</li>
			}
		</ul>
		<p data-lead>Lead: {lead()}</p>
	</section>
}
