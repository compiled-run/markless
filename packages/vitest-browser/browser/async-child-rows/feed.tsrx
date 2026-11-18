import { computed } from '@markless/core';
import { fetchShelf } from './fetch-shelf.ts';

export function Feed({ topic }: { topic: string }) @{
	const posts = computed(async () => await fetchShelf(`feed:${topic}`));

	<div data-feed>
		@try {
			@for (const post of posts; key post.id) {
				<p data-post>{post.text}</p>
			}
		} @pending {
			<p data-feed-pending>waiting</p>
		}
	</div>
}
