import { computed, state } from '@markless/core';
import BoolChild from './bool-child.tsrx';

export default function MemberBool() @{
	let n = state(2);
	const value = computed(() => ({ big: n > 1, n }));
	<div>
		<button data-flip onClick={() => (n = n === 2 ? 1 : 2)}>flip</button>
		<BoolChild value={value} />
	</div>
}
