import { computed, state } from '@markless/core';
import { postsAt, type Post } from './posts.ts';

// The block is drawn by a child the row hands its open state to as a prop.
function NoteBlock({ open }: { open: boolean }) @{
	<p>
		@if (open) {
			<span data-note>open</span>
		} @else {
			<span data-closed>closed</span>
		}
	</p>
}

function Row({ post, onLike }: { post: Post; onLike: () => void }) @{
	let note = state(false);

	<li>
		<span data-likes>{post.likes}</span>
		<button data-like onClick={onLike}>Like</button>
		<button data-expand onClick={() => (note = !note)}>Note {post.id}</button>
		<NoteBlock open={note} />
	</li>
}

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
					<Row post={post} onLike={() => (liked = [...liked, post.id])} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
