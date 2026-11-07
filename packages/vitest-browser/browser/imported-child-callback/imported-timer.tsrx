import { state } from '@markless/core';
import { Ticker } from './child.tsrx';

export default function ImportedTimerPage() @{
	let count = state(0);
	<div>
		<Ticker onTick={() => (count = count + 1)} />
		<span data-count>{count}</span>
	</div>
}
