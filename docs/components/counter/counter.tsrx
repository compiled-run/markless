import { state } from '@markless/core';

export function Counter({ count }: { count: number }) @{
	let current = state(count);

    <button onClick={() => current++}>{current}</button>
}
