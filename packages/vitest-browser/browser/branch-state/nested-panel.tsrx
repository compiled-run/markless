import { state } from '@markless/core';

export default function NestedPanel() @{
	let expanded = state(true);
	let signedIn = state(true);

	<article>
		@if (expanded) {
			<div>
				@if (signedIn) {
					let likes = state(0);

					<button data-likes onClick={() => likes++}>{likes}</button>
				}
			</div>
		}
		<button data-expand onClick={() => (expanded = !expanded)}>Expand or collapse</button>
	</article>
}
