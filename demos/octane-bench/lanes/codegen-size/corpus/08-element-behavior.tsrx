import { element, state } from '@markless/core';
export function ElementBehavior() @{
	let field = element(); let status = state('idle');
	<section><input el={field} /><button onClick={() => { field.focus(); status = 'focused'; }}>Focus</button><output>{status}</output></section>
}
