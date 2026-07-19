import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { fetchJson } from '../../../shared/data.js';

export const Route = createFileRoute('/')({
	validateSearch: (search) => ({ run: String(search.run ?? 'untracked') }),
	component: QueryLane,
});

function QueryLane() {
	const { run } = Route.useSearch();
	const session = useQuery({
		queryKey: ['session', run],
		queryFn: () => fetchJson('/api/session', run),
	});
	return (
		<main data-lane="query">
			<h1>TanStack Start component queries</h1>
			{session.isPending && <p data-pending>First render: session pending</p>}
			{session.isError && <p data-error>Session failed</p>}
			{session.data && (
				<>
					<p data-session>Session: {session.data.name}</p>
					<NestedRequirements run={run} user={session.data.user} />
				</>
			)}
		</main>
	);
}

function NestedRequirements({ run, user }) {
	const recommendations = useQuery({
		queryKey: ['recommendations', run, user],
		queryFn: () => fetchJson(`/api/recommendations?u=${encodeURIComponent(user)}`, run),
	});
	const catalog = useQuery({
		queryKey: ['catalog', run],
		queryFn: () => fetchJson('/api/catalog', run),
	});
	const reviews = useQuery({
		queryKey: ['reviews', run],
		queryFn: () => fetchJson('/api/reviews', run),
	});

	if (recommendations.isError || catalog.isError || reviews.isError)
		return <p data-error>Nested data failed</p>;
	if (recommendations.isPending || catalog.isPending || reviews.isPending)
		return <p data-pending>Nested requirements pending</p>;
	return (
		<section data-complete>
			<p data-recommendations>Recommendations: {recommendations.data.items.join(', ')}</p>
			<p data-catalog>Catalog: {catalog.data.title}</p>
			<p data-reviews>Reviews: {reviews.data.count}</p>
		</section>
	);
}
