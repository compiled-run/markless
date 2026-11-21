import { state } from '@markless/core';
import Badge from './badge.tsrx';

// An @if arm that holds a component.
export default function Panel() @{
	let open = state(false);

	<section>
		@if (open) {
			<div class="body">
				<Badge />
			</div>
		}
		<button data-open onClick={() => (open = !open)}>open</button>
	</section>
}
