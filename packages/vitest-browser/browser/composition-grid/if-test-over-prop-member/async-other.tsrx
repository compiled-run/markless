import { computed, state } from '@markless/core';
import FlagChild from './flag-child.tsrx';

export default function AsyncOther() @{
	let n = state(2);
	const value = computed(async () => ({ n }));
	<div>
		<button data-flip onClick={() => (n = n === 2 ? 1 : 2)}>flip</button>
		@try { <FlagChild value={value} /> } @pending { <p>loading</p> }
	</div>
}
