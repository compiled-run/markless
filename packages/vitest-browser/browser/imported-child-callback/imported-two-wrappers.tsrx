import { state } from '@markless/core';
import { Outer } from './outer.tsrx';

export default function ImportedTwoWrappersPage() @{
	let count = state(0);
	<div>
		<Outer onTick={() => (count = count + 1)} />
		<span data-count>{count}</span>
	</div>
}
