import { state } from '@markless/core';

export function ShadowedNamesPage() @{
	let user = state({ first: 'Ada', profile: { name: 'p' } });
	let total = state(0);
	let log = state('');

	<div>
		<output data-first>{user.first}</output>
		<output data-profile>{user.profile.name}</output>
		<output data-total>{total}</output>
		<output data-log>{log}</output>
		<button data-destructure onClick={() => { const { profile } = user; profile.name = 'w'; }}>destructure</button>
		<button data-shadow-alias onClick={() => { const profile = { name: 'local' }; profile.name = 'changed'; log = profile.name; }}>alias</button>
		<button data-shadow-state onClick={() => { const user = { first: 'local' }; user.first = 'q'; log = log + user.first; }}>state</button>
		<button data-shadow-param onClick={() => { [5].forEach((total) => { total += 1; log = log + total; }); }}>param</button>
	</div>
}
