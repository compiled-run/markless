import { state } from '@markless/core';

export function MapPage() @{
	let m = state(new Map([['a', 1]]));
	let k = state('a');
	<div>
		<output data-v>{m.get(k) ?? 'none'}</output>
		<output data-size>{m.size}</output>
		<output data-has>{m.has('b') ? 'yes' : 'no'}</output>
		<button data-set onClick={() => { m.set('a', 2); }}>a</button>
		<button data-add onClick={() => { m.set('b', 5); k = 'b'; }}>b</button>
		<button data-del onClick={() => { m.delete('a'); k = 'a'; }}>c</button>
		<button data-clear onClick={() => { m.clear(); }}>d</button>
	</div>
}
