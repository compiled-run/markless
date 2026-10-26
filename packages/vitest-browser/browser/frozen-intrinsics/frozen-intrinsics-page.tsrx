import { computed, state } from '@markless/core';

export function FrozenIntrinsicsPage() @{
	let items = state(['a']);
	let user = state({ first: 'Ada' });
	const summary = computed(() => items.join(',') + '|' + user.first);
	<div>
		<output data-o>{summary}</output>
		<button data-run onClick={() => { items.push('b'); user.first = 'Bo'; }}>run</button>
	</div>
}
