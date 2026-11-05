import { state } from '@markless/core';
import { noteFor } from './glossary-notes.ts';

export default function Gloss({ word }: { readonly word: string }) @{
	let open = state(false);
	let note = state('');

	<span class="gloss">
		<button type="button" data-gloss aria-expanded={open ? 'true' : 'false'} onClick={(event) => {
			note = noteFor(event.currentTarget.textContent ?? '');
			open = !open;
		}}>{word}</button>
		<span data-note hidden={!open}>{note}</span>
	</span>
}
