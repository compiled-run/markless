import { element, state } from '@markless/core';

export default function ElementBehavior() @{
	const field = element<HTMLInputElement>();
	let status = state('idle');

	<section>
		<input el={field} />
		<button onClick={() => { field?.focus(); status = 'focused'; }}>Focus</button>
		<output>{status}</output>
	</section>
}
