import { computed, state } from '@markless/core';
import { getPosts, getUser } from './api.ts';

export function UserPage({ params }: { params: { id: string } }) @{
	let sort = state<'new' | 'top'>('new');

	const user = computed(async () => {
		const user = await getUser(params.id);
		if (!user) throw new Error('User not found');
		return user;
	});

	const posts = computed(async () => await getPosts(params.id, sort));
	const heading = computed(() => `${posts.length} ${sort} posts`);

	<main>
		<style>
			[aria-busy='true'] {
				opacity: 0.6;
			}
		</style>

		@try {
			<>
				<h1>{user.name}</h1>
				<h2>{heading}</h2>
				<select value={sort} onChange={(event) => (sort = event.currentTarget.value)}>
					<option value="new">Latest</option>
					<option value="top">Top</option>
				</select>
				@try {
					<ul>
						@for (const post of posts; key post.id) {
							<li>{post.title}</li>
						}
					</ul>
				} @catch (error, reset) {
					<p>Couldn't refresh posts. <button onClick={reset}>Try again</button></p>
				}
			</>
		} @pending {
			<p>Loading profile...</p>
		} @catch (error, reset) {
			<>
				<p>Couldn't load this profile: {error.message}</p>
				<button onClick={reset}>Retry</button>
			</>
		}
	</main>
}
