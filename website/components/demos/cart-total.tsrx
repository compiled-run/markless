import { computed, state } from '@markless/core';

export default function CartTotal() @{
	let shirts = state(1);
	let mugs = state(0);
	const total = computed(() => shirts * 20 + mugs * 8);

	<section>
		<p>Shirts at 20 each: {shirts}</p>
		<p>Mugs at 8 each: {mugs}</p>
		<p>Total: {total}</p>
		<button onClick={() => shirts++}>Add a shirt</button>
		<button onClick={() => mugs++}>Add a mug</button>
	</section>
}
