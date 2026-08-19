import { state } from '@markless/core';
import { InstanceCollisionPart } from './instance-collision-part.tsrx';

export function InstanceCollisionRoot({ children }) @{
	let count = state(100);
	<div data-collision-root>
		<InstanceCollisionPart />
		<InstanceCollisionPart />
		<button type="button" data-root-count onClick={() => { count++; }}>{count}</button>
		{children}
	</div>
}
