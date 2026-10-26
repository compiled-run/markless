import { computed, state } from '@markless/core';

export function App() @{
	let user = state(1);
	const profile = computed(async () => {
		const id = user;
		await new Promise((resolve) => setTimeout(resolve, id === 1 ? 10 : 600));
		return { name: 'User ' + id };
	});
	const posts = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { count: 3 };
	});

	<main>
		<button type="button" data-next onClick={() => (user = 2)}>Next</button>
		<section data-outer>
			@try {
				<>
					<h2 data-name>{profile.name}</h2>
					<div data-inner>
						@try {
							<p data-count>{posts.count}</p>
						} @pending {
							<p data-pending>Loading posts</p>
						} @catch {
							<p data-failed>Posts broken</p>
						}
					</div>
				</>
			} @pending {
				<p data-pending>Loading profile</p>
			} @catch {
				<p data-failed>Profile broken</p>
			}
		</section>
	</main>
}
