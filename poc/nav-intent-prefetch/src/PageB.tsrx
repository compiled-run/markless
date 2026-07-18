import { computed, state } from '@markless/core';

export function PageB() @{
	let catalogSection = state('handbook');
	const session = computed(async ({ signal }) =>
		fetch(`/api/session?run=${encodeURIComponent(globalThis.__navIntentRun)}`, { signal }).then(
			(response) => response.json(),
		),
	);
	const sessionCard = computed(() => ({ user: session.user }));
	const recommendations = computed(async ({ signal }) =>
		fetch(
			`/api/recommendations?run=${encodeURIComponent(globalThis.__navIntentRun)}&u=${encodeURIComponent(sessionCard.user)}`,
			{ signal },
		).then((response) => response.json()),
	);
	const catalog = computed(async ({ signal }) =>
		fetch(
			`/api/catalog?run=${encodeURIComponent(globalThis.__navIntentRun)}&section=${encodeURIComponent(catalogSection)}`,
			{ signal },
		).then((response) => response.json()),
	);

	<main>
		<h1>Destination</h1>
		<section>@try {
			<p>{recommendations.items.join(', ')}</p>
		} @pending {
			<p>Loading recommendations</p>
		} @catch {
			<p>Recommendations unavailable</p>
		}</section>
		<section>@try {
			<p>{catalog.title}</p>
		} @pending {
			<p>Loading catalog</p>
		} @catch {
			<p>Catalog unavailable</p>
		}</section>
	</main>
}
