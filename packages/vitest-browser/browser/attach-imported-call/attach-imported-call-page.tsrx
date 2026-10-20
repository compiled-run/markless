import { state } from '@markless/core';
import { watch } from './watch.ts';

export default function AttachImportedCallPage() @{
	let pressed = state(0);

	<main>
		<div data-plain attach={(el) => watch(el)}>
			<button type="button" data-plain-press onClick={() => pressed++}>{pressed}</button>
		</div>
		<div data-labelled attach={(node) => watch(node, `label-${node.tagName.toLowerCase()}`)}>
			<button type="button" data-labelled-press onClick={() => pressed++}>press</button>
		</div>
	</main>
}
