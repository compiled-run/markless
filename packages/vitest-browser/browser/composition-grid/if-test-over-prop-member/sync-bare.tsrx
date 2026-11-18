import { state } from '@markless/core';
import BareChild from './bare-child.tsrx';

export default function SyncBare() @{
	let n = state(2);
	<div>
		<button data-flip onClick={() => (n = n === 2 ? 1 : 2)}>flip</button>
		<BareChild n={n} />
	</div>
}
