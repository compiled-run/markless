import { computed, state } from '@markless/core';
import { postsAt, type Post } from './posts.ts';

// The same block, but every caller passes a value that never changes, so it ships as rendered.
function NoteBlock({ open }: { open: boolean }) @{
	let deep = state(false);

	<p>
		@if (open) {
			<span data-note>
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

function Row({ post }: { post: Post }) @{
	<li>
		<span data-likes>{post.likes}</span>
		<NoteBlock open={true} />
	</li>
}

export default function Page() @{
	let added = state(0);
	const posts = computed(async () => postsAt(added, []));

	<section>
		<button data-add onClick={() => added++}>Add</button>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<Row post={post} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
