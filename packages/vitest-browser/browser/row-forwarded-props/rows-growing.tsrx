import { state } from '@markless/core';
import { Pair } from './pair.tsrx';

export default function RowsGrowing() @{
	const groups = state(['one']);
	<main>
		<button type="button" data-add onClick={() => { groups.push('two'); }}>add</button>
		@for (const group of groups; key group) {
			<Pair name={group} />
		}
	</main>
}
