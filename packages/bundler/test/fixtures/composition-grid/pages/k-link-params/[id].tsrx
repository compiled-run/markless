import { computed, state } from '@markless/core';
import { Link } from '@markless/router';
import type { PageProps } from '@markless/router';

export default function LinkParamsPage({ params }: PageProps<{ id: string }>) @{
	let round = state(0);
	const item = computed(async () => ({ id: `${params.id}-${round}` }));

	<main>
		<button type="button" onClick={() => (round += 1)}>next</button>
		@try {
			<Link data-g="link" href="/k-link-params/[id]/edit" params={{ id: item.id }}>Edit</Link>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
