import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export default function RowsRenamed() @{
	const shelves = state([{ id: 1, label: 'alpha' }, { id: 2, label: 'beta' }]);
	<ul>
		<button type="button" data-rename onClick={() => { shelves[0].label = 'gamma'; }}>rename</button>
		@for (const shelf of shelves; key shelf.id) {
			<li><Shelf heading={shelf.label} /></li>
		}
	</ul>
}
