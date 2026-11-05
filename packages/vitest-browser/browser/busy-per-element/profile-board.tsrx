import { computed, state } from '@markless/core';

function Badge({ label }: { label: string }) @{
	<em data-badge>{label}</em>
}

export function ProfileBoard() @{
	let sort = state<'new' | 'top'>('new');
	let who = state(1);
	let checked = state(false);
	const user = computed(async () => {
		const id = who;
		await new Promise((resolve) => setTimeout(resolve, id === 1 ? 10 : 700));
		return { name: 'User ' + id };
	});
	const posts = computed(async () => {
		const by = sort;
		await new Promise((resolve) => setTimeout(resolve, by === 'new' ? 10 : 1_400));
		return by === 'new'
			? [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
			: [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }];
	});
	const heading = computed(() => `${posts.length} ${sort} posts`);

	<main>
		<button type="button" data-both onClick={() => { who = 2; sort = 'top'; }}>Both</button>
		<section data-block>
			@try {
				<>
					<h1 data-name>{user.name}</h1>
					<h2 data-heading>{heading}</h2>
					<Badge label={user.name} />
					<select data-sort value={sort} onChange={(event) => (sort = event.currentTarget.value as 'new' | 'top')}>
						<option value="new">Latest</option>
						<option value="top">Top</option>
					</select>
					<input data-check type="checkbox" checked={checked} onChange={() => (checked = !checked)} />
					<ul data-posts>
						@for (const post of posts; key post.id) {
							<li>{post.title}</li>
						}
					</ul>
				</>
			} @pending {
				<p data-pending>Loading</p>
			} @catch {
				<p data-failed>Broken</p>
			}
		</section>
	</main>
}
