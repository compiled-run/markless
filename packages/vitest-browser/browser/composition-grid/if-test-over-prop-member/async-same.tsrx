import { computed, state } from '@markless/core';

function SameChild({ value }: { value: { n: number } }) @{
	@if (value.n > 1) {
		<p data-r>big {value.n}</p>
	} @else {
		<p data-r>small {value.n}</p>
	}
}

export default function AsyncSame() @{
	let n = state(2);
	const value = computed(async () => ({ n }));
	<div>
		<button data-flip onClick={() => (n = n === 2 ? 1 : 2)}>flip</button>
		@try { <SameChild value={value} /> } @pending { <p>loading</p> }
	</div>
}
