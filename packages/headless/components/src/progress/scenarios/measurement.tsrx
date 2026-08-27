import { state } from '@markless/core';
import { progress } from '../../index.ts';

export default function Measurement() @{
	let count = state('30 of 100 rows');

	<section>
		<progress.root value={30} data-testid="root">
			<progress.label data-testid="label">Export data</progress.label>
			<progress.valuelabel data-testid="valuelabel" children={count} />
			<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
		</progress.root>
		<button type="button" data-testid="advance" onClick={() => { count = '60 of 100 rows'; }}>
			Recount
		</button>
	</section>
}
