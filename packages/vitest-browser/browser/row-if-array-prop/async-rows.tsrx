import { computed, state } from '@markless/core';

async function postsFor(count: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

function Row({ post, opened, onToggle }: { post: { id: number }; opened: number[]; onToggle: () => void }) @{
	<li>
		<button data-toggle onClick={onToggle}>Toggle {post.id}</button>
		@if (opened.includes(post.id)) {
			<span data-open>open</span>
		}
	</li>
}

export default function Page() @{
	let count = state(3);
	let opened = state<number[]>([]);
	const posts = computed(async () => postsFor(count));

	<section>
		<button data-open-first onClick={() => (opened = opened.includes(1) ? opened.filter((id) => id !== 1) : [...opened, 1])}>First</button>
		@try {
			<ul>
				@for (const post of posts; key post.id) {
					<Row
						post={post}
						opened={opened}
						onToggle={() =>
							(opened = opened.includes(post.id) ? opened.filter((id) => id !== post.id) : [...opened, post.id])
						}
					/>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
