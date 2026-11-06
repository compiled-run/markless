import { state } from '@markless/core';

export default function Greeting() @{
	let open = state(false);
	let signedIn = state(false);

	<section>
		@if (open) {
			<div data-panel>
				@if (signedIn) {
					<p data-greeting>Welcome back</p>
				} @else {
					<p data-greeting>Sign in to comment</p>
				}
			</div>
		}
		<button data-open onClick={() => (open = !open)}>Open or close</button>
		<button data-sign onClick={() => (signedIn = !signedIn)}>Sign in or out</button>
	</section>
}
