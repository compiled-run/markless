import { computed, state } from '@markless/core';
import { loadTitle } from './title.ts';

export default function TryArm() @{
	let open = state(false);
	const title = computed(async () => await loadTitle());

	<div>
		<button data-toggle onClick={() => (open = !open)}>Open</button>
		@try {
			<>
				<h4>{title}</h4>
				@if (open) {
					let stamps = state(10);

					<b data-count onClick={() => (stamps = stamps - 1)}>{stamps}</b>
				}
			</>
		} @pending {
			<em>Waiting</em>
		}
	</div>
}
