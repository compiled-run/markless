import { state } from '@markless/core';

export default function RowElementFacts() @{
	let rows = state([
		{ id: 'a', name: 'Ada' },
		{ id: 'b', name: 'Bo' },
	]);
	let seen = state('');
	<main>
		<ul>
			@for (const row of rows; key row.id) {
				<li
					data-name={row.name}
					onPointerdown={(event) => {
						seen = `pressed ${event.currentTarget.getAttribute('data-name')}`;
					}}
				>
					<span>{row.name}</span>
				</li>
			}
		</ul>
		<p>{seen}</p>
	</main>
}
