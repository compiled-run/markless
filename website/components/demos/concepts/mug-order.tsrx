import { computed, state } from '@markless/core';

export default function MugOrder() @{
	let mugs = state(1);
	let coasters = state(0);
	const total = computed(() => mugs * 12 + coasters * 3);

	<section>
		<p>Mugs at 12 each: {mugs}</p>
		<p>Coasters at 3 each: {coasters}</p>
		<p>Total: {total}</p>
		<button onClick={() => mugs++}>Add a mug</button>
		<button onClick={() => coasters++}>Add a coaster</button>
	</section>
}
