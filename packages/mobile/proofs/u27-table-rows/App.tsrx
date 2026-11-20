import { state } from '@markless/core';
import { table } from '@markless/ui';

export default function App() @{
	let chosen = state('none');
	const files = state([
		{ id: 'notes', name: 'notes.txt' },
		{ id: 'photo', name: 'photo.png' },
	]);
	<main>
		<h1>Folder</h1>
		<table.root value={[]} onChange={(next) => (chosen = next.join(',') || 'none')}>
			<tbody>
				@for (const file of files; key file.id) {
					<table.item value={file.id}>
						<td>{file.name}</td>
					</table.item>
				}
			</tbody>
		</table.root>
		<p>{`Chosen ${chosen}`}</p>
	</main>
}
