import { state } from '@markless/core';
import NoteRow, { type Note } from './note.tsrx';

const seed: Note = {
	id: 1,
	text: 'root',
	replies: [
		{ id: 2, text: 'child', replies: [{ id: 3, text: 'grandchild', replies: [{ id: 4, text: 'leaf', replies: [] }] }] },
		{ id: 5, text: 'sibling', replies: [] },
	],
};

function rename(note: Note, id: number, text: string): Note {
	return {
		...note,
		text: note.id === id ? text : note.text,
		replies: note.replies.map((reply) => rename(reply, id, text)),
	};
}

export default function Thread() @{
	let tree = state(seed);
	<div>
		<button type="button" data-edit-deep onClick={() => (tree = rename(tree, 4, 'leaf edited'))}>deep</button>
		<button type="button" data-edit-root onClick={() => (tree = rename(tree, 1, 'root edited'))}>root</button>
		<button type="button" data-edit-child onClick={() => (tree = rename(tree, 2, 'child edited'))}>child</button>
		<button type="button" data-edit-mid onClick={() => (tree = rename(tree, 3, 'grandchild edited'))}>mid</button>
		<ul>
			<NoteRow text={tree.text} replies={tree.replies} />
		</ul>
	</div>
}
