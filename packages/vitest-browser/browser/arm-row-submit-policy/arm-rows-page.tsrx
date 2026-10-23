import { computed, state } from '@markless/core';

export default function ArmRowsPage() @{
	let submitted = state('none');
	const data = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
	});
	<main>
		<output data-submitted>{submitted}</output>
		@try {
			<ul>
				@for (const row of data.rows; key row.id) {
					<li>
						<form
							data-row={row.id}
							onSubmit={(event) => {
								event.preventDefault();
								submitted = (event.target as HTMLFormElement).dataset.row ?? '';
							}}
						>
							<button type="submit">Go</button>
						</form>
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
