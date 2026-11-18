import { computed, state } from '@markless/core';
import { NoteRow } from './note-row.tsrx';
import { postsAt } from './posts.ts';

export default function Page() @{
	let added = state(0);
	let liked = state<number[]>([]);
	const posts = computed(async () => postsAt(added, liked));

	<section>
		<button data-add onClick={() => added++}>Add</button>
		<button data-refresh onClick={() => (liked = [...liked])}>Refresh</button>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<NoteRow post={post} onLike={() => (liked = [...liked, post.id])} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
