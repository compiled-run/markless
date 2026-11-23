import { element, state } from '@markless/core';
import { describeUpload } from '../lib/upload.ts';

export default function App() @{
	let shown = state('nothing sent');
	const field = element<HTMLInputElement>();
	<main>
		<h1>Upload</h1>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				data.append('note', new File(['hi'], 'hi.txt', { type: 'text/plain' }));
				const answer = await fetch('http://127.0.0.1:28761/upload', { method: 'POST', body: data });
				shown = describeUpload(await answer.text());
			}}
		>
			<input type="text" name="title" aria-label="Title" value="Trip" />
			<input el={field} type="file" name="photo" aria-label="Photo" />
			<button
				type="button"
				onClick={() => {
					field?.showPicker();
					shown = 'chosen';
				}}
			>
				Choose
			</button>
			<button type="submit">Send</button>
		</form>
		<p>{shown}</p>
	</main>
}
