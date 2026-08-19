import { state } from '@markless/core';

export function InstanceCollisionPart() @{
	let count = state(0);
	<button type="button" class="part" onClick={() => { count++; }}>{count}</button>
}
