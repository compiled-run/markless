import { state } from '@markless/core';
import Badge from './badge.tsrx';

// An @if arm that holds a keyed list and a component.
export default function Rich() @{
	let open = state(false);
	let tags = state(['x', 'y']);

	<section>
		@if (open) {
			<div class="body">
				<ul>
					@for (const tag of tags; key tag) {
						<li>{tag}</li>
					}
				</ul>
				<Badge />
			</div>
		}
		<button data-open onClick={() => (open = !open)}>open</button>
		<button data-add onClick={() => tags.push(`t${tags.length}`)}>add</button>
	</section>
}
