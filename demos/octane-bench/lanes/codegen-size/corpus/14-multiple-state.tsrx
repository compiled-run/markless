import { state } from '@markless/core';
export function MultipleState() @{
	let first = state(1); let second = state(2); let label = state('sum');
	<section><button onClick={() => { first++; second += 2; label = 'updated'; }}>Update</button><span>{label}</span><output>{first + second}</output></section>
}
