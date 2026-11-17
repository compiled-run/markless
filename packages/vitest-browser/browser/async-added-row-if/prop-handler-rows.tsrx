import { computed, state } from '@markless/core';
import { postsAt, type Post } from './posts.ts';

// The block is drawn by a child given its open state as a prop, and its open arm holds a handler.
function NoteBlock({ open, onClose }: { open: boolean; onClose: () => void }) @{
	let deep = state(false);

	<p>
		@if (open) {
			<span data-note>
				<button data-close onClick={onClose}>Close</button>
				<button data-deeper onClick={() => (deep = !deep)}>More</button>
				@if (deep) {
					<em data-deep>More</em>
				}
			</span>
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
		<NoteBlock open={note} onClose={() => (note = false)} />
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
