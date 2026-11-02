import { state } from '@markless/core';
import { Card } from './card.tsrx';

export default function CardRows() @{
	const rows = state([
		{ id: 1, title: 'alpha-card-title', tags: ['p', 'q'] },
		{ id: 2, title: 'beta-card-title', tags: ['r'] },
	]);
	<ul>
		@for (const row of rows; key row.id) {
			<li><Card item={row} /></li>
		}
	</ul>
}
