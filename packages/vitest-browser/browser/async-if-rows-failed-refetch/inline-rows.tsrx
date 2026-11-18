import { computed, state } from '@markless/core';
import { failNextFetch, fetchPosts } from './fetch-posts.ts';

export default function Page() @{
	let round = state(0);
	let editing = state<number[]>([]);
	let expanded = state<number[]>([]);
	const posts = computed(async () => fetchPosts(round));
	const flip = (list: number[], id: number) => (list.includes(id) ? list.filter((open) => open !== id) : [...list, id]);

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
					<li>
						<span data-title>{post.title}</span>
						<button data-toggle onClick={() => (editing = flip(editing, post.id))}>Rename</button>
						<button data-expand onClick={() => (expanded = flip(expanded, post.id))}>Note</button>
						@if (editing.includes(post.id)) {
							<form data-form><input /></form>
						}
						@if (expanded.includes(post.id)) {
							<label data-note>Note</label>
						} @else {
							<span data-closed>closed</span>
						}
						@if (post.flagged) {
							<p data-flag>flagged</p>
						}
					</li>
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
