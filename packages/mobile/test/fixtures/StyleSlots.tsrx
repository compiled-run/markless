import { computed, state } from '@markless/core';

export default function StyleSlots() @{
	let at = state(25);
	let rank = state(1);
	const thumb = computed(() => `--at: ${Math.round(at * 10) / 10}%; order: ${Math.floor(rank)}`);
	<main>
		<div style={thumb}>Thumb</div>
		<button onClick={() => (at = at + 12.25)}>Move</button>
		<button onClick={() => (rank = rank + 0)}>Same</button>
		<button onClick={() => (rank = rank + 2)}>Later</button>
	</main>
}
