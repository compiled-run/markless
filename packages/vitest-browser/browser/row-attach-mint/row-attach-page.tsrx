import { state } from '@markless/core';

export default function Page() @{
	let rows = state<{ id: number; html: string }[]>([]);

	<main>
		<button class="fill" onClick={() => (rows = [{ id: 1, html: '<b>bold</b>' }, { id: 2, html: '<i>italic</i>' }])}>fill</button>
		<div class="rows">
			@for (const row of rows; key row.id) {
				<div class="row" attach={(el) => void (el.innerHTML = row.html)}></div>
			}
		</div>
	</main>
}
