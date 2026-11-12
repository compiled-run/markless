import { computed, state } from '@markless/core';
import { failNextFetch, fetchPosts } from './fetch-posts.ts';

function PostRow({ post }: { post: { id: number; title: string; flagged: boolean } }) @{
	let editing = state(false);
	let expanded = state(false);

	<li>
		<span data-title>{post.title}</span>
		<button data-toggle onClick={() => (editing = !editing)}>Rename</button>
		<button data-expand onClick={() => (expanded = !expanded)}>Note</button>
		@if (editing) {
			<form data-form><input /></form>
		}
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

export default function Page() @{
	let round = state(0);
	const posts = computed(async () => fetchPosts(round));

	<section>
		<button data-refresh onClick={() => round++}>Refresh</button>
		<button
			data-fail
			onClick={() => {
				failNextFetch();
				round++;
			}}
		>
			Fail
		</button>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<PostRow post={post} />
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<p data-error>
				{error.message} <button data-retry onClick={reset}>Retry</button>
			</p>
		}
	</section>
}
