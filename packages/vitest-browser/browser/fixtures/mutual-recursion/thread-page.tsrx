import { state } from '@markless/core';
import Comment from './thread.tsrx';

export default function ThreadPage() @{
	let root = state({
		id: 'a',
		text: 'first',
		replies: [{ id: 'b', text: 'second', replies: [{ id: 'c', text: 'third', replies: [] }] }],
	});

	<main>
		<Comment item={root} />
	</main>
}
