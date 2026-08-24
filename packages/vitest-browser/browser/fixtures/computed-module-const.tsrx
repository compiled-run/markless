import { computed, state } from '@markless/core';

// The declarations the derive module has to carry. A `sync-computed-derive`
// module is fetched and evaluated on its own, so every one of these has to be
// IN it: the server render reads them from this file and stays green either
// way, which is exactly why the gap was invisible until the browser re-derived.
const RATE = 3;
const PREFIX = 'total';
// Read only by the async computed below, whose runner module is fetched and
// evaluated on its own for exactly the same reason the derive module is.
const ENDPOINT = 'api';

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
	// The async twin. Its runner module is a separate module too, and it reaches
	// three module-scope declarations at once: `ENDPOINT` directly, and `scale`,
	// which drags `class Scale` and the `RATE` its construction reads in behind
	// it. The result only lands after the promise resolves, which is the part the
	// derive lanes above cannot witness.
	const fetched = computed(async () => {
		const path = `${ENDPOINT}/${scale.apply(count)}`;
		await Promise.resolve();
		return { path };
	});

	<main>
		<span data-scaled>{scaled}</span>
		<span data-via-class>{viaClass}</span>
		<span data-labelled>{labelled}</span>
		@try {
			<span data-fetched>{fetched.path}</span>
		} @pending {
			<span data-fetching>loading</span>
		} @catch {
			<span data-failed>failed</span>
		}
		<button type="button" data-bump onClick={() => count = count + 1}>bump</button>
	</main>
}
