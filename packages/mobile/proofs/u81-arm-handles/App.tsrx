import { element, state } from '@markless/core';

export default function ArmHandles() @{
	let open = state(false);
	let seen = state('');
	const extra = element<HTMLButtonElement>();
	const presses = element<HTMLButtonElement[]>();
	<main>
		<button el={presses} onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<button el={[extra, presses]}>Extra</button>
		}
		<button el={presses} onClick={() => (seen = `${presses.length} ${extra ? 'with extra' : 'no extra'}`)}>Count</button>
		<p>{seen}</p>
	</main>
}
