import { computed, state } from '@markless/core';


function Oops({ message }: { readonly message: string }) @{
	<p data-g="oops">{message}</p>
}
// Fails at load, then each press flips whether the next load fails; each failure says which round it was.
export default function CatchErrorSameFilePage() @{
	let round = state(0);
	const loaded = computed(async () => {
		const at = round;
		if (at % 2 === 0) throw new Error(`Not Found ${at}`);
		return `found ${at}`;
	});

	<main>
		<button type="button" onClick={() => (round += 1)}>next</button>
		@try {
			<p data-g="loaded">{loaded}</p>
		} @catch (error) {
			<Oops message={error.message} />
		}
	</main>
}
