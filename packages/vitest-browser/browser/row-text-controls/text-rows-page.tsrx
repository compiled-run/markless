import { state } from '@markless/core';

export default function TextRowsPage() @{
	let rows = state([
		{ id: 1, name: 'ada' },
		{ id: 2, name: 'lin' },
	]);
	let picked = state('none');
	<main>
		<p data-picked>{picked}</p>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					Row {row.name} here
					<form data-form={row.name} onSubmit={(event) => { event.preventDefault(); picked = row.name; }}>
						<button type="submit">Send</button>
					</form>
					<button data-pick={row.name} onClick={() => picked = `${row.name}!`}>pick</button>
				</li>
			}
		</ul>
	</main>
}
