import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export default function RowsThreeFiles() @{
	const shelves = state([{ id: 1, label: 'alpha' }, { id: 2, label: 'beta' }]);
	<ul>
		@for (const shelf of shelves; key shelf.id) {
			<li><Shelf heading={shelf.label} /></li>
		}
	</ul>
}
