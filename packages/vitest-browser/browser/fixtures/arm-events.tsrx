import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let note = state('none');
	let taps = state(0);

	// The container-level onClick gives SSR resume a flat event record on an
	// ancestor of the arm buttons: the inline resumer's wake set does not
	// include branch armRecords event names yet, and the arm buttons are the
	// first interaction this fixture's tests perform. Closest-wins dispatch
	// still routes button clicks to the arm records, not this handler.
	<main onClick={() => taps++}>
		<button type="button" data-toggle onClick={() => open = !open}>Toggle</button>
		<output data-note>{note}</output>
		@if (open) {
			<section>
				<button type="button" data-open onClick={() => note = 'from-open'}>Open action</button>
			</section>
		} @else {
			<section>
				<button type="button" data-closed onClick={() => note = 'from-closed'}>Closed action</button>
			</section>
		}
	</main>
}
