import { computed, state } from '@markless/core';
import { loadCard } from '../src/card.ts';

// A streamed card and 10 buttons outside any list, each with its own state.
export default function Page() @{
	let c0 = state(0);
	let c1 = state(0);
	let c2 = state(0);
	let c3 = state(0);
	let c4 = state(0);
	let c5 = state(0);
	let c6 = state(0);
	let c7 = state(0);
	let c8 = state(0);
	let c9 = state(0);
	const card = computed(async () => loadCard());

	<main>
		@try {
			<p class="card">{card.title}: {card.total}</p>
		} @pending {
			<p class="card">Loading</p>
		}
		<div class="buttons">
			<button class="b b0" onClick={() => c0++}>Button 0: {c0}</button>
			<button class="b b1" onClick={() => c1++}>Button 1: {c1}</button>
			<button class="b b2" onClick={() => c2++}>Button 2: {c2}</button>
			<button class="b b3" onClick={() => c3++}>Button 3: {c3}</button>
			<button class="b b4" onClick={() => c4++}>Button 4: {c4}</button>
			<button class="b b5" onClick={() => c5++}>Button 5: {c5}</button>
			<button class="b b6" onClick={() => c6++}>Button 6: {c6}</button>
			<button class="b b7" onClick={() => c7++}>Button 7: {c7}</button>
			<button class="b b8" onClick={() => c8++}>Button 8: {c8}</button>
			<button class="b b9" onClick={() => c9++}>Button 9: {c9}</button>
		</div>
	</main>
}
