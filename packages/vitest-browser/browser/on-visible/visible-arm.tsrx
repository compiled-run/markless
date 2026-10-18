import { state } from '@markless/core';

export function App() @{
	let open = state(false);
	let seen = state(0);

	<main>
		<button type="button" data-toggle onClick={() => (open = !open)}>
			Toggle
		</button>
		<output data-seen>{seen}</output>
		@if (open) {
			<p data-visible onVisible={() => (seen = seen + 1)}>
				in arm
			</p>;
		}
	</main>;
}
