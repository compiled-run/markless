import { state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Admin({ http }: PageProps) @{
	const forbidden = http.url.searchParams.has('forbidden');
	const name = (http.locals as { requestId?: string }).requestId ?? 'guest';
	if (forbidden) http.response.status = 403;
	let visits = state(0);

	<div>
		@if (forbidden) {
			<main data-forbidden><h1>Guides only</h1></main>
		} @else {
			<main data-admin><p>Signed in as {name}.</p></main>
		}
		<button type="button" data-visit onClick={() => visits++}>{visits}</button>
	</div>
}
