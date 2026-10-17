import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import { armLateWrite, writeStatusLate } from '../src/late-write.ts';

export default function Late({ http }: PageProps) @{
	armLateWrite(http);
	const late = computed(async () => await writeStatusLate());

	<main data-page="late">
		@try {
			<p data-late-write>{late.code}</p>
		} @pending {
			<p data-pending>waiting</p>
		}
	</main>
}
