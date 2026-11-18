import { state } from '@markless/core';
import { CounterArm } from './counter-arm.tsrx';

export function BranchImportedIfPage() @{
	let open = state(true);
	let bumps = state(0);
	let label = state('note');

	<main>
		<output data-bumps>{bumps}</output>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		<button type="button" data-relabel onClick={() => (label = label + '?')}>Relabel</button>
		@if (open) {
			<CounterArm label={label} onBump={() => (bumps = bumps + 1)} />
		}
	</main>
}
