import { computed, state } from '@markless/core';
import FlagChild from './flag-child.tsrx';

export default function SyncOther() @{
	let n = state(2);
	const value = computed(() => ({ n }));
	<div>
		<button data-flip onClick={() => (n = n === 2 ? 1 : 2)}>flip</button>
		<FlagChild value={value} />
	</div>
}
