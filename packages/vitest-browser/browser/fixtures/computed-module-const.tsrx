import { computed, state } from '@markless/core';

// The declarations the derive module has to carry. A `sync-computed-derive`
// module is fetched and evaluated on its own, so every one of these has to be
// IN it: the server render reads them from this file and stays green either
// way, which is exactly why the gap was invisible until the browser re-derived.
const RATE = 3;
const PREFIX = 'total';

class Scale {
	step: number;

	constructor(step: number) {
		this.step = step;
	}

	apply(value: number): number {
		return value * this.step;
	}
}

// Authored AFTER the class it constructs. A carry that emitted reachability
// order would put this first and run `new Scale()` inside the class binding's
// temporal dead zone.
const scale = new Scale(RATE);

export function App() @{
	let count = state(1);

	const scaled = computed(() => count * RATE);
	const viaClass = computed(() => scale.apply(count));
	const labelled = computed(() => `${PREFIX}:${count * RATE}`);

	<main>
		<span data-scaled>{scaled}</span>
		<span data-via-class>{viaClass}</span>
		<span data-labelled>{labelled}</span>
		<button type="button" data-bump onClick={() => count = count + 1}>bump</button>
	</main>
}
