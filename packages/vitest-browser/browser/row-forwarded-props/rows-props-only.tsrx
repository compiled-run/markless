import { state } from '@markless/core';
import { PlainPair } from './props-only-pair.tsrx';

export default function RowsPropsOnly() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<PlainPair name={group} />
		}
	</main>
}
