import { computed, state } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	let open = state(false);
	let id = state(4);

	<div>
		<button data-open onClick={() => (open = true)}>Open</button>
		<button data-next onClick={() => (id = id + 1)}>Next</button>
		@if (open) {
			<Card id={id} />
		}
	</div>
}

function Card({ id }: { id: number }) @{
	const title = computed(async () => fetchTitle(id));

	<section data-title>
		@try {
			<>{title}</>
		} @pending {} @catch {}
	</section>
}
