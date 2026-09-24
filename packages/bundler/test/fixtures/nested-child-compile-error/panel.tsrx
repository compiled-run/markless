import { state } from '@markless/core';
import type { Section } from './sections.ts';

export default function Panel({ section }: { readonly section: Section }) @{
	let open = state(false);

	<section>
		<button type="button" aria-expanded={open ? 'true' : 'false'} onClick={() => (open = !open)}>{section.label}</button>
		<p hidden={!open}>{section.body}</p>
	</section>
}
