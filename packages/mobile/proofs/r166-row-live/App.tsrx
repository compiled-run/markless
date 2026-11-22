import { state } from '@markless/core';

type Upload = { readonly id: string; readonly name: string };

export default function App() @{
	const uploads: ReadonlyArray<Upload> = [
		{ id: 'a', name: 'Photo' },
		{ id: 'b', name: 'Report' },
	];
	let failed = state(false);
	<main>
		<h1>Uploads</h1>
		<ul>
			@for (const upload of uploads; key upload.id) {
				<li role={upload.id === 'b' && failed ? 'alert' : 'status'}>
					{`${upload.name} ${upload.id === 'b' && failed ? 'failed' : 'saved'}`}
				</li>
			}
		</ul>
		<button onClick={() => (failed = !failed)}>Fail report</button>
	</main>
}
