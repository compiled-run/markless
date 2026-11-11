import { computed, state } from '@markless/core';
import { fetchPosts } from './fetch-posts.ts';

function PostRow({ post }: { post: { id: number; title: string; flagged: boolean } }) @{
	let expanded = state(false);

	<li>
		<span data-title>{post.title}</span>
		<button data-expand onClick={() => (expanded = !expanded)}>Note</button>
		@if (expanded) {
			<label data-note>Note</label>
		} @else {
			<span data-closed>closed</span>
		}
		@if (post.flagged) {
			<p data-flag>flagged</p>
		}
	</li>
}

// The first fetch fails; Refresh asks again.
export default function Page() @{
	let round = state(0);
	const posts = computed(async () => fetchPosts(round, round === 0));

	<section>
		<button data-refresh onClick={() => round++}>Refresh</button>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<PostRow post={post} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error) {
			<p data-error>{error.message}</p>
		}
	</section>
}
