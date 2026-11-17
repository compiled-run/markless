import { state } from '@markless/core';
import { getFiles, type FileEntry } from './files.ts';

function Row({ file }: { file: FileEntry }) @{
	let typed = state(file.name);
	let wanted = state<string | null>(null);

	<li data-file>
		<span data-name>{wanted ?? file.name}</span>
		<input data-typed value={typed} onInput={(event) => (typed = event.currentTarget.value)} />
		<button data-rename onClick={() => (wanted = 'Clicked')}>Rename</button>
	</li>
}

export default function App() @{
	let files = state<FileEntry[]>([]);

	<main onIdle={async () => (files = await getFiles())}>
		<ul>
			@for (const file of files; key file.id) {
				<Row file={file} />
			}
		</ul>
	</main>
}
