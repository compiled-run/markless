import { state } from '@markless/core';
import { Spread } from './wrappers.tsrx';

export default function ImportedSpreadPage() @{
	let count = state(0);
	<div>
		<Spread onTick={() => (count = count + 1)} />
		<span data-count>{count}</span>
	</div>
}
