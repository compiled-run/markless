import { computed, state } from '@markless/core';

export function SetPage() @{
	let s = state(new Set(['x']));
	const list = computed(() => [...s].join(','));
	<div>
		<output data-has>{s.has('y') ? 'yes' : 'no'}</output>
		<output data-size>{s.size}</output>
		<output data-list>{list}</output>
		<button data-add onClick={() => { s.add('y'); }}>a</button>
		<button data-del onClick={() => { s.delete('x'); }}>b</button>
		<button data-clear onClick={() => { s.clear(); }}>c</button>
	</div>
}
