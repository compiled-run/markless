import { state } from '@markless/core';

export default function TeaNote() @{
	let open = state(false);

	<section>
		<style>
			.note {
				font-style: italic;
			}
		</style>
		<button onClick={() => (open = !open)}>{open ? 'Hide' : 'Show'} the note</button>
		@if (open) {
			<p class="note">Steep it for three minutes.</p>
		}
	</section>
}
