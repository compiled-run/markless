import { state } from '@markless/core';

export function SayButton({ word }: { readonly word: string }) @{
	let said = state('');
	<div>
		<button type="button" data-say onClick={() => (said = word)}>say</button>
		<output data-said>{said}</output>
	</div>;
}
