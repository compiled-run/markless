import { state } from '@markless/core';

export function FileUpload() @{
	let shown = state('none');
	<main>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				data.append('note', new File(['hi'], 'hi.txt', { type: 'text/plain' }));
				const answer = await fetch('https://example.com/upload', { method: 'POST', body: data });
				shown = await answer.text();
			}}
		>
			<input type="text" name="title" aria-label="Title" />
			<input type="file" name="photo" aria-label="Photo" />
			<button type="submit">Send</button>
		</form>
		<p>{shown}</p>
	</main>
}
