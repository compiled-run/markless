import { state } from '@markless/core';
import { counterFrom, counterPair } from './counter-helpers.tsrx';

function localCounter() {
	const local = state(10);
	return local;
}

export default function Page() @{
	const count = counterPair();
	const five = counterFrom(5);
	const ten = localCounter();
	<main>
		<button data-count onClick={() => count++}>{count}</button>
		<button data-five onClick={() => five++}>{five}</button>
		<button data-ten onClick={() => ten++}>{ten}</button>
	</main>
}
