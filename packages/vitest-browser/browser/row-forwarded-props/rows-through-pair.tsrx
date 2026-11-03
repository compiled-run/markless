import { state } from '@markless/core';
import { Pair } from './pair.tsrx';

export default function RowsThroughPair() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<Pair name={group} />
		}
	</main>
}
