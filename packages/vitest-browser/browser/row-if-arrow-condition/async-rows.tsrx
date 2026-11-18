import { computed, state } from '@markless/core';
import ArrowRow from './arrow-row.tsrx';

async function postsFor(count: number) {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

export default function Page() @{
	let count = state(3);
	let opened = state<number[]>([]);
	const posts = computed(async () => postsFor(count));

	@try {
		<ul>
			@for (const post of posts; key post.id) {
				<ArrowRow
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
}
