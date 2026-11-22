import { state } from '@markless/core';

function Row({ id }: { id: string }) @{
	let open = state(false);

	<li data-row={id}>
		<button data-toggle onClick={() => (open = !open)}>{id}</button>
		@if (open) {
			let taps = state(0);

			<b data-count onClick={() => taps++}>{taps}</b>
		}
	</li>
}

export default function RowArm() @{
	let ids = state(['ann', 'bo']);

	<section>
		<button data-reverse onClick={() => (ids = [...ids].reverse())}>Reverse</button>
		<ul>
			@for (const id of ids; key id) {
				<Row id={id} />
			}
		</ul>
	</section>
}
