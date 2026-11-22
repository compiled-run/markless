import { state, storage } from '@markless/core';
import { navigate } from '@markless/router';
import Nav from '../lib/Nav.tsrx';

export default function NewNote() @{
	let saved = storage('titles', '');
	let title = state('');
	<Nav>
		<title>New note</title>
		<h1>New note</h1>
		<input aria-label="Title" value={title} onInput={(event) => (title = event.currentTarget.value)} />
		<button
			onClick={async () => {
				saved = saved === '' ? title : `${title}|${saved}`;
				await navigate(`/notes/${title}`);
			}}
		>
			Save note
		</button>
	</Nav>
}
