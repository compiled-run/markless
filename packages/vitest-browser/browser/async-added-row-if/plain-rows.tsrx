import { state } from '@markless/core';
import { NoteRow } from './note-row.tsrx';

export default function Page() @{
	let posts = state([1, 2, 3].map((id) => ({ id, likes: 0 })));

	<section>
		<button data-add onClick={() => (posts = [...posts, { id: posts.length + 1, likes: 0 }])}>Add</button>
		<button data-refresh onClick={() => (posts = posts.map((post) => ({ ...post })))}>Refresh</button>
		<ul>
			@for (const post of posts; key post.id) {
				<NoteRow
					post={post}
					onLike={() =>
						(posts = posts.map((each) => (each.id === post.id ? { ...each, likes: each.likes + 1 } : each)))
					}
				/>
			}
		</ul>
	</section>
}
