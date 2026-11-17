import { state } from '@markless/core';

export default function Page() @{
	let open = state(false);

	<main>
		<button data-open onClick={() => (open = true)}>Open</button>
		@try {
			<div>
				@if (open) {
					<p data-shown>shown</p>
				}
			</div>
		} @pending {
			<div hidden></div>
		}
	</main>
}
