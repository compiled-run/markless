import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<button onClick={() => count++}>Clicked {count} times</button>
}
