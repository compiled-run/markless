import { storage } from '@markless/core';

let count = storage('persist-demo-count', '0');

export function FirstCounter() @{
	<div class="demo">
		<button type="button" data-first onClick={() => (count = String(Number(count) + 1))}>Increment</button>
		<span data-first-count>{count}</span>
	</div>
}

export function SecondCounter() @{
	<div class="demo">
		<button type="button" data-second onClick={() => (count = String(Number(count) + 1))}>Increment</button>
		<span data-second-count>{count}</span>
	</div>
}
