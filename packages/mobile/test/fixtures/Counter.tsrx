import { state } from '@markless/core';

export function Counter() @{
	let count = state(0);

	<main class="screen">
		<h1 class="title">Counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}
