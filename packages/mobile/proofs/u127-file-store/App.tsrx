import { element, state } from '@markless/core';
import { addNote } from '../lib/file-store.ts';

export default function App() @{
	let shown = state('none');
	const box = element<HTMLDivElement>();
	<main>
		<h1>Files</h1>
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
