import { computed, state } from '@markless/core';

export default function ProfilePage() @{
	let userId = state(1);
	const user = computed(async () => {
		const id = userId;
		await Promise.resolve();
		return { name: id === 1 ? 'Ada' : 'Grace' };
	});
	const posts = computed(async () => [{ id: 'p1' }, { id: 'p2' }]);
	<main>
		<button type="button" data-next-user onClick={() => (userId = 2)}>
			next
		</button>
		@try {
			<>
				<h1 data-user>{user.name}</h1>
				<p data-posts>{posts.length} posts</p>
			</>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error) {
			<p data-failure>{error.message}</p>
		}
	</main>
}
