import { state } from '@markless/core';
import AsyncInner from './async-inner.tsrx';

export default function AsyncOuter({ depth }: { depth: number }) @{
	let open = state(true);

	<div data-outer>
		<button type="button" data-flip onClick={() => (open = !open)}>{open ? 'open' : 'closed'}</button>
		<AsyncInner depth={depth} />
	</div>
}
