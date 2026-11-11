import { computed, state } from '@markless/core';
import { loadPosts } from './posts.ts';

function FeedPage({ page }: { page: number }) @{
	const posts = computed(async ({ signal }) =>
		loadPosts(page, signal),
	);

	<li>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<li>{post.title}</li>
				}
			</ul>
		} @pending {
			<p>Loading page {page}</p>
		} @catch (error, reset) {
			<p>
				<span>Page {page} didn't load.</span>
				<button onClick={reset}>Try again</button>
			</p>
		}
	</li>
}

export default function Feed() @{
	let pages = state([1]);

	<section>
		<ol>
			@for (const page of pages; key page) {
				<FeedPage page={page} />
			}
		</ol>
		<button
			onClick={() => {
				pages = [...pages, pages.length + 1];
			}}
		>
			Load more
		</button>
	</section>
}
