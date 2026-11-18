import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	let open = state(false);

	<div>
		<button data-open onClick={() => (open = true)}>Open</button>
		@if (open) {
			<Card id={4} />
		}
	</div>
}

function Card({ id }: { id: number }) @{
	const title = computed(async () => fetchTitle(id));

	<section data-title>
		@try {
			<>{title} (#{id})</>
		} @pending {} @catch {}
	</section>
}
