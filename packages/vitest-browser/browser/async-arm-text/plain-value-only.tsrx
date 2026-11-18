import { computed } from '@markless/core';
import { fetchTitle } from './fetch-title.ts';

export default function Page() @{
	<div>
		<Card id={4} />
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
