import { state } from '@markless/core';
import { Clicker } from './child.tsrx';

export default function ImportedClickPage() @{
	let count = state(0);
	<div>
		<Clicker onTick={() => (count = count + 1)} />
		<span data-count>{count}</span>
	</div>
}
