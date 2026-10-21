import { state } from '@markless/core';

export function Counter({ name }: { name: string }) @{
	let count = state(0);

	<button type="button" data-counter={name} onClick={() => count++}>{count}</button>
}
