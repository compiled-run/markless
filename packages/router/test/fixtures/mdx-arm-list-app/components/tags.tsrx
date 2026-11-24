import { state } from '@markless/core';

export default function Tags() @{
	let open = state(true);
	let tags = state(['x', 'y']);

	<section>
		@if (open) {
			<ul>
				@for (const tag of tags; key tag) {
					<li>{tag}</li>
				}
			</ul>
		}
		<button data-add onClick={() => tags.push(`t${tags.length}`)}>add</button>
		<button data-toggle onClick={() => (open = !open)}>toggle</button>
	</section>
}
