import { element, state } from '@markless/core';
import { addNote } from '../../proofs/lib/file-store.ts';

export function Files() @{
	let shown = state('none');
	const box = element<HTMLDivElement>();
	<main>
		<div el={box}>Box</div>
		<button
			onClick={() => {
				if (box) shown = addNote(box);
			}}
		>
			Add
		</button>
		<p>{shown}</p>
	</main>
}
