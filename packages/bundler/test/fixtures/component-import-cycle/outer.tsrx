import { state } from '@markless/core';
import Inner from './inner.tsrx';

export default function Outer({ depth }: { depth: number }) @{
	let open = state(true);

	<div data-outer>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<Inner depth={depth} />
	</div>
}
