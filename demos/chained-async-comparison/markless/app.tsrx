import { computed } from '@markless/core';
import { fetchCatalog, fetchRecommendations, fetchReviews, fetchSession } from './data.ts';

export function App() @{
	const session = computed(async ({ signal }) => fetchSession(signal));
	const recommendations = computed(async ({ signal }) => fetchRecommendations(session.user, signal));
	const catalog = computed(async ({ signal }) => fetchCatalog(signal));
	const reviews = computed(async ({ signal }) => fetchReviews(signal));

	<main data-lane="markless">
		<h1>Markless async computeds</h1>
		<section>@try {
			<p data-session>Session: {session.name}</p>
		} @pending { <p data-session-pending>Loading session</p> } @catch { <p data-error>Session failed</p> }</section>
		<section>@try {
			<p data-recommendations>Recommendations: {recommendations.items.join(', ')}</p>
		} @pending { <p data-recommendations-pending>Loading recommendations</p> } @catch { <p data-error>Recommendations failed</p> }</section>
		<section>@try {
			<p data-catalog>Catalog: {catalog.title}</p>
		} @pending { <p data-catalog-pending>Loading catalog</p> } @catch { <p data-error>Catalog failed</p> }</section>
		<section>@try {
			<p data-reviews>Reviews: {reviews.count}</p>
		} @pending { <p data-reviews-pending>Loading reviews</p> } @catch { <p data-error>Reviews failed</p> }</section>
	</main>
}
