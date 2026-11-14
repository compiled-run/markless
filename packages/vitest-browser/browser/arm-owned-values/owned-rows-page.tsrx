import { state } from '@markless/core';
import OwnedRows from './owned-rows.tsrx';

export default function OwnedRowsPage() @{
	let round = state(0);

	<main>
		<button type="button" data-next onClick={() => round++}>Next</button>
		<OwnedRows name="x" round={round} start={[{ id: 1, tag: 'x1' }, { id: 2, tag: 'x2' }]} />
		<OwnedRows name="y" round={round} start={[{ id: 1, tag: 'y1' }, { id: 2, tag: 'y2' }]} />
	</main>
}
