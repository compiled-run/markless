import { state } from '@markless/core';

function localCounter() {
	const local = state(10);
	return local;
}

export default function LocalPage() @{
	const ten = localCounter();
	<main>
		<button data-ten onClick={() => ten++}>{ten}</button>
	</main>
}
