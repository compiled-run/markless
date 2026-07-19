import { createFileRoute } from '@tanstack/react-router';

import { fetchJson } from '../../../shared/data.js';

export const Route = createFileRoute('/')({
	validateSearch: (search) => ({ run: String(search.run ?? 'untracked') }),
	loaderDeps: ({ search }) => ({ run: search.run }),
	loader: async ({ deps: { run } }) => {
		const session = fetchJson('/api/session', run);
		const catalog = fetchJson('/api/catalog', run);
		const reviews = fetchJson('/api/reviews', run);
		const recommendations = session.then((value) =>
			fetchJson(`/api/recommendations?u=${encodeURIComponent(value.user)}`, run),
		);
		const [sessionData, recommendationsData, catalogData, reviewsData] = await Promise.all([
			session,
			recommendations,
			catalog,
			reviews,
		]);
		return { sessionData, recommendationsData, catalogData, reviewsData };
	},
	component: LoaderLane,
});

function LoaderLane() {
	const { sessionData, recommendationsData, catalogData, reviewsData } = Route.useLoaderData();
	return (
		<main data-lane="loader">
			<h1>TanStack Start route loader</h1>
			<p data-session>Session: {sessionData.name}</p>
			<p data-recommendations>Recommendations: {recommendationsData.items.join(', ')}</p>
			<p data-catalog>Catalog: {catalogData.title}</p>
			<p data-reviews>Reviews: {reviewsData.count}</p>
		</main>
	);
}
