import { state } from '@markless/core';

export default function LabelledCounter() @{
	let count = state(0);

	<p>You clicked {count} times.</p>
	<button onClick={() => count++}>Click me</button>
}
