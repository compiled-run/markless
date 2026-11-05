import { state } from '@markless/core';

export default function Gloss({ word }: { readonly word: string }) @{
	let open = state(false);
	let note = state('');

	<span class="gloss">
		<button type="button" data-gloss aria-expanded={open ? 'true' : 'false'} onClick={(event) => {
			note = 'What ' + (event.currentTarget.textContent ?? '') + ' means.';
			open = !open;
		}}>{word}</button>
		<span data-note hidden={!open}>{note}</span>
	</span>
}
