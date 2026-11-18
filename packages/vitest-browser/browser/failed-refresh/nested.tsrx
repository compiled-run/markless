import { computed, state } from '@markless/core';

export function Profile() @{
	let order = state('new');
	const author = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { name: 'Rin' };
	});
	const posts = computed(async () => {
		const by = order;
		await new Promise((resolve) => setTimeout(resolve, by === 'new' ? 10 : 120));
		if (by === 'top') throw new Error('Ranking unavailable');
		return by === 'new' ? ['Alpha', 'Beta'] : ['Gamma'];
	});

	<main>
		<button type="button" data-top onClick={() => (order = 'top')}>Top</button>
		<button type="button" data-old onClick={() => (order = 'old')}>Oldest</button>
		<section data-profile>
			@try {
				<>
					<h2 data-author>{author.name}</h2>
					<div data-feed>
						@try {
							<ol>
								@for (const title of posts; key title) {
									<li>{title}</li>
								}
							</ol>
						} @catch (error) {
							<small data-feed-error>{error.message}</small>
						}
					</div>
				</>
			} @pending {
				<p data-pending>Loading profile</p>
			} @catch {
				<p data-profile-error>Profile unavailable</p>
			}
		</section>
	</main>
}
